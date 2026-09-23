import * as THREE from 'three';
import type { ArticleStarDefinition, NebulaDefinition } from '../../data/universe';
import { UNIVERSE_CONFIG } from './core/config';
import { clamp01, easeInOutCubic, smoothstep } from './core/math';
import { UniverseStateMachine, type UniverseState } from './core/UniverseStateMachine';
import { createGlowTexture } from './render/materials';
import { ArticleBurstSystem } from './systems/ArticleBurstSystem';
import { ArticleStarSystem, type ArticleStarRuntime } from './systems/ArticleStarSystem';
import { BackgroundStarField } from './systems/BackgroundStarField';
import { IntroStarField } from './systems/IntroStarField';
import { NebulaSystem } from './systems/NebulaSystem';
import { UniverseHud } from './ui/UniverseHud';

export type UniverseRoute = 'home' | 'post';

export interface UniverseContent {
  articleStars: ArticleStarDefinition[];
  nebulae: NebulaDefinition[];
}

export interface UniverseEngineOptions {
  content: UniverseContent;
  initialRoute: UniverseRoute;
  initialSlug: string | null;
}

interface CameraTransition {
  cosmosPosition: THREE.Vector3;
  cosmosQuaternion: THREE.Quaternion;
  articlePosition: THREE.Vector3;
  articleQuaternion: THREE.Quaternion;
}

export class UniverseEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(
    UNIVERSE_CONFIG.camera.fov,
    1,
    UNIVERSE_CONFIG.camera.near,
    UNIVERSE_CONFIG.camera.far,
  );
  private readonly clock = new THREE.Clock();
  private readonly stateMachine: UniverseStateMachine;
  private readonly reducedMotion: boolean;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly intro: IntroStarField;
  private readonly background: BackgroundStarField;
  private readonly nebulae: NebulaSystem;
  private readonly articleStars: ArticleStarSystem;
  private readonly burst: ArticleBurstSystem;
  private readonly hud: UniverseHud;

  private readonly mouseNdc = new THREE.Vector2();
  private readonly mouseWorld = new THREE.Vector3();
  private readonly pointerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5);
  private readonly raycaster = new THREE.Raycaster();
  private readonly coverPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly temporaryCamera = new THREE.PerspectiveCamera();
  private raf = 0;
  private globalElapsed = 0;
  private pointerMoved = false;
  private contextLost = false;
  private route: UniverseRoute;
  private currentSlug: string | null;
  private selectedStar: ArticleStarRuntime | null = null;
  private cameraTransition: CameraTransition | null = null;
  private entryPromise: Promise<void> | null = null;
  private entryResolve: (() => void) | null = null;
  private returnPromise: Promise<void> | null = null;
  private returnResolve: (() => void) | null = null;
  private returnReady = false;
  private selectedStarIntegrity = 1;
  private readonly cosmosIdle = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    active: false,
  };

  constructor(shell: HTMLElement, options: UniverseEngineOptions) {
    const canvas = shell.querySelector<HTMLCanvasElement>('#universe-canvas');
    if (!canvas) throw new Error('Universe canvas not found.');
    this.canvas = canvas;
    this.route = options.initialRoute;
    this.currentSlug = options.initialSlug;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.stateMachine = new UniverseStateMachine(options.initialRoute === 'post' ? 'article' : 'cover');

    this.camera.position.set(0, 0, UNIVERSE_CONFIG.camera.coverZ);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x02030a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.glowTexture = createGlowTexture();
    const pixelRatio = this.getPixelRatio();
    this.intro = new IntroStarField(this.scene, this.camera, this.glowTexture, pixelRatio, this.reducedMotion);
    this.background = new BackgroundStarField(this.scene, pixelRatio, this.reducedMotion);
    this.nebulae = new NebulaSystem(this.scene, options.content.nebulae, pixelRatio, this.reducedMotion);
    this.articleStars = new ArticleStarSystem(this.scene, options.content.articleStars, options.content.nebulae, this.glowTexture);
    this.burst = new ArticleBurstSystem(this.scene, pixelRatio, this.reducedMotion);
    this.hud = new UniverseHud(shell);

    this.attachEvents();
    this.resize();

    if (options.initialRoute === 'post') {
      this.restoreDirectArticle(options.initialSlug);
    } else {
      this.syncStateVisuals();
    }
  }

  get state(): UniverseState {
    return this.stateMachine.state;
  }

  start() {
    if (this.raf || this.contextLost) return;
    this.clock.start();
    this.raf = requestAnimationFrame(this.tick);
  }

  handleRoute(route: UniverseRoute, slug: string | null) {
    this.route = route;
    this.currentSlug = slug;
    document.documentElement.dataset.pageKind = route;

    if (route === 'post') {
      const selectedMatchesRoute = this.selectedStar?.def.slug === slug;
      if (this.state === 'article-enter' && selectedMatchesRoute) this.stateMachine.force('article');
      // Post-to-post navigation must explicitly move the persistent scene to the new star.
      if (this.state !== 'article' || !selectedMatchesRoute) this.restoreDirectArticle(slug);
      if (this.state === 'article') this.burst.cleanup();
    } else if (this.state !== 'cover' && this.state !== 'collapse' && this.state !== 'bigbang') {
      if (this.state !== 'cosmos') this.restoreCosmos();
    }
    this.syncStateVisuals();
  }

  prepareEntry(slug: string): Promise<void> {
    if (this.state === 'article' && this.currentSlug === slug) return Promise.resolve();
    if (this.state === 'article-enter' && this.currentSlug === slug && this.entryPromise) return this.entryPromise;

    const star = this.articleStars.findBySlug(slug);
    if (!star) return Promise.resolve();

    if (this.state !== 'cosmos') this.restoreCosmos();
    this.currentSlug = slug;
    this.selectedStar = star;
    this.selectedStarIntegrity = 1;
    this.cameraTransition = this.createCameraTransition(star, true);
    this.burst.configure(star.def.slug, star.world, star.def.theme);
    this.burst.setProgress(0);
    this.stateMachine.transition('article-enter');
    this.syncStateVisuals();

    this.entryPromise = new Promise<void>((resolve) => {
      this.entryResolve = resolve;
    });
    return this.entryPromise;
  }

  prepareReturn(slug: string | null): Promise<void> {
    if (this.state === 'cosmos') return Promise.resolve();
    if (this.state === 'article-return' && this.returnPromise) return this.returnPromise;
    if (this.state === 'article-return' && this.returnReady) return Promise.resolve();

    const star = this.articleStars.findBySlug(slug ?? this.currentSlug) ?? this.selectedStar;
    if (!star) {
      this.restoreCosmos();
      return Promise.resolve();
    }

    this.returnReady = false;
    this.currentSlug = star.def.slug;
    this.selectedStar = star;
    this.selectedStarIntegrity = 0;
    if (!this.cameraTransition) this.cameraTransition = this.createCameraTransition(star, false);
    this.applyCameraProgress(1);
    this.burst.configure(star.def.slug, star.world, star.def.theme);
    this.burst.setProgress(1);

    if (this.state !== 'article') this.stateMachine.force('article');
    this.stateMachine.transition('article-return');
    this.syncStateVisuals();

    this.returnPromise = new Promise<void>((resolve) => {
      this.returnResolve = resolve;
    });
    return this.returnPromise;
  }

  recoverNavigationFailure(route: UniverseRoute, slug: string | null) {
    this.route = route;
    if (route === 'home') {
      this.restoreCosmos();
      return;
    }

    const star = this.articleStars.findBySlug(slug ?? this.currentSlug) ?? this.selectedStar;
    if (!star) return;
    this.currentSlug = star.def.slug;
    this.selectedStar = star;
    this.selectedStarIntegrity = 0;
    if (!this.cameraTransition) this.cameraTransition = this.createCameraTransition(star, false);
    this.applyCameraProgress(1);
    this.stateMachine.force('article');
    this.background.setOpacity(0.34);
    this.nebulae.setFormation(1);
    this.nebulae.setOpacity(0.42);
    this.intro.setOpacity(0);
    this.intro.setCursorOpacity(0);
    this.burst.cleanup();
    this.returnReady = false;
    this.resolveEntry();
    this.resolveReturn();
    this.syncStateVisuals();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('mousemove', this.onCoverMouseMove);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.intro.dispose();
    this.background.dispose();
    this.nebulae.dispose();
    this.articleStars.dispose();
    this.burst.dispose();
    this.glowTexture.dispose();
    this.renderer.dispose();
  }

  private attachEvents() {
    window.addEventListener('resize', this.resize, { passive: true });
    window.addEventListener('mousemove', this.onCoverMouseMove, { passive: true });
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = this.getPixelRatio();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.intro.setPixelRatio(pixelRatio);
    if (this.state === 'cover' || this.state === 'collapse') this.intro.reflow(width, height);
    this.background.setPixelRatio(pixelRatio);
    this.nebulae.setPixelRatio(pixelRatio);
    this.burst.setPixelRatio(pixelRatio);
    if (this.state === 'cover' || this.state === 'collapse') this.refreshCoverPointer();
  };

  private onCoverMouseMove = (event: MouseEvent) => {
    if (this.state !== 'cover' && this.state !== 'collapse') return;
    this.pointerMoved = true;
    this.pointerScreen.set(event.clientX, event.clientY);
    this.hud.setPointerPosition(event.clientX, event.clientY);
    this.updatePointerWorld(event.clientX, event.clientY);
  };

  // Cosmos-state canvas clicks are intentionally inert: the article index owns navigation.
  private onCanvasClick = (event: MouseEvent) => {
    if (this.route === 'post' || this.state !== 'cover') return;

    this.pointerScreen.set(event.clientX, event.clientY);
    this.hud.setPointerPosition(event.clientX, event.clientY);
    this.updatePointerWorld(event.clientX, event.clientY);
    this.pointerMoved = true;
    this.intro.setPointer(this.mouseWorld, true);
    this.intro.beginCollapse(this.mouseWorld);
    this.stateMachine.transition('collapse');
    this.syncStateVisuals();
  };

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private onContextRestored = () => {
    this.contextLost = false;
    this.resize();
    this.start();
  };

  private tick = () => {
    if (this.contextLost) return;
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.033);
    this.globalElapsed += deltaSeconds;
    this.stateMachine.tick(deltaSeconds);
    this.update(deltaSeconds);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };

  private update(deltaSeconds: number) {
    this.nebulae.update(this.globalElapsed, deltaSeconds);

    switch (this.state) {
      case 'cover': this.updateCover(deltaSeconds); break;
      case 'collapse': this.updateCollapse(); break;
      case 'bigbang': this.updateBigBang(deltaSeconds); break;
      case 'cosmos': this.updateCosmos(deltaSeconds); break;
      case 'article-enter': this.updateArticleEnter(); break;
      case 'article': this.updateArticle(); break;
      case 'article-return': this.updateArticleReturn(); break;
    }

    this.articleStars.updateAppearance(
      this.camera,
      this.state,
      this.globalElapsed,
      this.currentSlug,
      this.selectedStarIntegrity,
    );
  }

  private updateCover(deltaSeconds: number) {
    this.intro.setPointer(this.mouseWorld, this.pointerMoved);
    const gathered = this.intro.updateCover(deltaSeconds);
    this.hud.setCursorGlowOpacity(this.pointerMoved ? 0.28 + gathered * 0.36 : 0.08);
    this.background.setOpacity(0);
    this.nebulae.setOpacity(0);
  }

  private updateCollapse() {
    const duration = this.reducedMotion
      ? UNIVERSE_CONFIG.timings.collapseReduced
      : UNIVERSE_CONFIG.timings.collapse;
    const progress = clamp01(this.stateMachine.stateElapsed / duration);
    this.intro.updateCollapse(progress);
    this.hud.setCursorGlowOpacity(0);
    if (progress >= 1) {
      this.stateMachine.transition('bigbang');
      this.intro.beginBigBang();
      this.nebulae.setOrigin(this.intro.getExplosionOrigin());
      this.nebulae.setFormation(0);
      this.syncStateVisuals();
    }
  }

  private updateBigBang(deltaSeconds: number) {
    const duration = this.reducedMotion
      ? UNIVERSE_CONFIG.timings.bigBangReduced
      : UNIVERSE_CONFIG.timings.bigBang;
    const progress = clamp01(this.stateMachine.stateElapsed / duration);
    this.intro.updateBigBang(deltaSeconds, progress);

    const reveal = smoothstep(0.08, 0.78, progress);
    const backgroundReveal = smoothstep(0.22, 0.9, progress);
    const explosionOpacity = 1 - smoothstep(0.52, 1, progress);
    this.intro.setOpacity(explosionOpacity);
    this.background.setOpacity(backgroundReveal * 0.72);
    this.nebulae.setOpacity(reveal * 0.84);
    this.nebulae.setFormation(easeInOutCubic(reveal));
    this.camera.position.z = THREE.MathUtils.lerp(
      UNIVERSE_CONFIG.camera.coverZ,
      UNIVERSE_CONFIG.camera.cosmosZ,
      smoothstep(0.12, 0.9, progress),
    );

    if (progress >= 1) {
      this.stateMachine.transition('cosmos');
      this.enterCosmosAfterBigBang();
    }
  }

  private updateCosmos(_deltaSeconds: number) {
    this.intro.setOpacity(0);
    this.intro.setCursorOpacity(0);
    this.background.setOpacity(0.72);
    this.nebulae.setFormation(1);
    this.nebulae.setOpacity(0.82);
    this.updateCosmosIdle();
  }

  // Deterministic idle sway keeps the nebula field alive behind the article index.
  private updateCosmosIdle() {
    if (!this.cosmosIdle.active) return;
    const t = this.globalElapsed;
    this.camera.position.set(
      this.cosmosIdle.position.x + Math.sin(t * 0.07) * 0.35,
      this.cosmosIdle.position.y + Math.sin(t * 0.09) * 0.3,
      this.cosmosIdle.position.z,
    );
    this.camera.quaternion.copy(this.cosmosIdle.quaternion);
    this.camera.rotateY(Math.sin(t * 0.11) * 0.012);
    this.camera.rotateX(Math.sin(t * 0.08) * 0.008);
  }

  private updateArticleEnter() {
    if (!this.selectedStar || !this.cameraTransition) {
      this.restoreCosmos();
      this.resolveEntry();
      return;
    }

    const duration = this.reducedMotion
      ? UNIVERSE_CONFIG.timings.articleReduced
      : UNIVERSE_CONFIG.timings.article;
    const t = clamp01(this.stateMachine.stateElapsed / duration);
    const progress = easeInOutCubic(t);
    this.selectedStarIntegrity = 1 - smoothstep(0.08, 0.55, progress);
    this.applyCameraProgress(progress);
    this.burst.setProgress(progress);
    this.background.setOpacity(THREE.MathUtils.lerp(0.72, 0.34, progress));
    this.nebulae.setOpacity(THREE.MathUtils.lerp(0.82, 0.42, progress));

    if (t >= 1) {
      this.applyCameraProgress(1);
      this.stateMachine.transition('article');
      this.resolveEntry();
      this.syncStateVisuals();
    }
  }

  private updateArticle() {
    this.selectedStarIntegrity = 0;
    this.background.setOpacity(0.34);
    this.nebulae.setFormation(1);
    this.nebulae.setOpacity(0.42);
  }

  private updateArticleReturn() {
    if (!this.cameraTransition) {
      // Hold article-return until the home document has actually swapped in.
      if (!this.returnReady) {
        this.burst.setProgress(0);
        this.selectedStarIntegrity = 1;
        this.returnReady = true;
        this.resolveReturn();
      }
      return;
    }

    const duration = this.reducedMotion
      ? UNIVERSE_CONFIG.timings.articleReduced
      : UNIVERSE_CONFIG.timings.article;
    const t = clamp01(this.stateMachine.stateElapsed / duration);
    const entryProgress = 1 - easeInOutCubic(t);
    this.selectedStarIntegrity = 1 - smoothstep(0.08, 0.55, entryProgress);
    this.applyCameraProgress(entryProgress);
    this.burst.setProgress(entryProgress);
    this.background.setOpacity(THREE.MathUtils.lerp(0.72, 0.34, entryProgress));
    this.nebulae.setOpacity(THREE.MathUtils.lerp(0.82, 0.42, entryProgress));

    if (t >= 1 && !this.returnReady) {
      // Never expose cosmos while the old article DOM is still mounted.
      this.applyCameraProgress(0);
      this.burst.setProgress(0);
      this.selectedStarIntegrity = 1;
      this.returnReady = true;
      this.resolveReturn();
    }
  }

  private enterCosmosAfterBigBang() {
    this.intro.setOpacity(0);
    this.intro.setCursorOpacity(0);
    this.background.setOpacity(0.72);
    this.nebulae.setFormation(1);
    this.nebulae.setOpacity(0.82);
    this.camera.position.z = UNIVERSE_CONFIG.camera.cosmosZ;
    this.captureCosmosIdle();
    this.syncStateVisuals();
  }

  private restoreCosmos() {
    this.stateMachine.force('cosmos');
    this.intro.setOpacity(0);
    this.intro.setCursorOpacity(0);
    this.background.setOpacity(0.72);
    this.nebulae.setFormation(1);
    this.nebulae.setOpacity(0.82);

    if (this.cameraTransition) {
      this.camera.position.copy(this.cameraTransition.cosmosPosition);
      this.camera.quaternion.copy(this.cameraTransition.cosmosQuaternion);
    } else {
      this.camera.position.set(0, 0, UNIVERSE_CONFIG.camera.cosmosZ);
      this.camera.lookAt(0, 0, -30);
    }
    this.captureCosmosIdle();
    this.burst.cleanup();
    this.selectedStar = null;
    this.currentSlug = null;
    this.cameraTransition = null;
    this.returnReady = false;
    this.selectedStarIntegrity = 1;
    this.resolveEntry();
    this.resolveReturn();
    this.syncStateVisuals();
  }

  private restoreDirectArticle(slug: string | null) {
    const star = this.articleStars.findBySlug(slug);
    if (!star) {
      this.restoreCosmos();
      return;
    }
    this.burst.cleanup();
    this.returnReady = false;
    this.selectedStarIntegrity = 0;
    this.stateMachine.force('article');
    this.currentSlug = star.def.slug;
    this.selectedStar = star;
    this.cameraTransition = this.createCameraTransition(star, false);
    this.applyCameraProgress(1);
    this.background.setOpacity(0.34);
    this.nebulae.setFormation(1);
    this.nebulae.setOpacity(0.42);
    this.intro.setOpacity(0);
    this.intro.setCursorOpacity(0);
    this.syncStateVisuals();
  }

  private captureCosmosIdle() {
    this.cosmosIdle.position.copy(this.camera.position);
    this.cosmosIdle.quaternion.copy(this.camera.quaternion);
    this.cosmosIdle.active = true;
  }

  private createCameraTransition(star: ArticleStarRuntime, preserveCurrentCosmosPose: boolean): CameraTransition {
    const cosmosPosition = preserveCurrentCosmosPose
      ? this.camera.position.clone()
      : star.world.clone().add(new THREE.Vector3(0, 0.08, 1).normalize().multiplyScalar(10.5));
    const cosmosQuaternion = preserveCurrentCosmosPose
      ? this.camera.quaternion.clone()
      : this.lookQuaternion(cosmosPosition, star.world);

    const approachDirection = cosmosPosition.clone().sub(star.world);
    if (approachDirection.lengthSq() < 0.001) approachDirection.set(0, 0.08, 1);
    approachDirection.normalize();
    const articlePosition = star.world.clone().addScaledVector(approachDirection, 4.8);
    const articleQuaternion = this.lookQuaternion(articlePosition, star.world);

    return { cosmosPosition, cosmosQuaternion, articlePosition, articleQuaternion };
  }

  private applyCameraProgress(progress: number) {
    if (!this.cameraTransition) return;
    const p = clamp01(progress);
    this.camera.position.lerpVectors(
      this.cameraTransition.cosmosPosition,
      this.cameraTransition.articlePosition,
      p,
    );
    this.camera.quaternion.slerpQuaternions(
      this.cameraTransition.cosmosQuaternion,
      this.cameraTransition.articleQuaternion,
      p,
    );
  }

  private lookQuaternion(position: THREE.Vector3, target: THREE.Vector3) {
    this.temporaryCamera.position.copy(position);
    this.temporaryCamera.up.copy(this.camera.up);
    this.temporaryCamera.lookAt(target);
    return this.temporaryCamera.quaternion.clone();
  }

  private resolveEntry() {
    this.entryResolve?.();
    this.entryResolve = null;
    this.entryPromise = null;
  }

  private resolveReturn() {
    this.returnResolve?.();
    this.returnResolve = null;
    this.returnPromise = null;
  }

  private updatePointerWorld(clientX: number, clientY: number) {
    this.mouseNdc.set(
      (clientX / Math.max(1, window.innerWidth)) * 2 - 1,
      -(clientY / Math.max(1, window.innerHeight)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    this.raycaster.ray.intersectPlane(this.coverPlane, this.mouseWorld);
    this.intro.setPointer(this.mouseWorld, true);
  }

  private refreshCoverPointer() {
    if (!this.pointerMoved) {
      this.mouseWorld.set(0, 0, 0);
      this.intro.setPointer(this.mouseWorld, false);
      return;
    }
    this.updatePointerWorld(this.pointerScreen.x, this.pointerScreen.y);
  }

  private syncStateVisuals() {
    this.hud.setState(this.state);
    const coverVisible = this.state === 'cover' || this.state === 'collapse';
    this.hud.setCursorGlowOpacity(coverVisible ? (this.pointerMoved ? 0.28 : 0.08) : 0);
    document.documentElement.dataset.pageKind = this.route;
  }

  private getPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, UNIVERSE_CONFIG.renderer.maxPixelRatio);
  }
}
