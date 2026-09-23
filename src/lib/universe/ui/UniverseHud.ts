export class UniverseHud {
  private readonly shell: HTMLElement;
  private readonly cursorGlow: HTMLElement | null;

  constructor(shell: HTMLElement) {
    this.shell = shell;
    this.cursorGlow = shell.querySelector('#cursor-glow');
  }

  setPointerPosition(x: number, y: number) {
    this.cursorGlow?.style.setProperty('--x', `${x}px`);
    this.cursorGlow?.style.setProperty('--y', `${y}px`);
  }

  setCursorGlowOpacity(opacity: number) {
    if (this.cursorGlow) this.cursorGlow.style.opacity = String(opacity);
  }

  setState(state: string) {
    document.documentElement.dataset.universeState = state;
    this.shell.dataset.universeState = state;
  }
}
