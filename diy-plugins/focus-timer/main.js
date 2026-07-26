export function activate(api) {
  const focus = Math.max(1, Number(api.config.focusMinutes || 25)) * 60;
  const rest = Math.max(1, Number(api.config.breakMinutes || 5)) * 60;
  const target = Math.max(1, Number(api.config.dailyTarget || 8));
  let phase = "focus";
  let remaining = focus;
  let running = false;
  let sessions = 0;
  let timer;
  api.root.innerHTML = `
    <section class="focus-shell">
      <div class="focus-ring"><strong>25:00</strong><span>专注</span></div>
      <p class="focus-progress">今日 0 / ${target} 次</p>
      <div class="focus-actions">
        <button data-action="toggle">开始</button>
        <button data-action="reset">重置</button>
      </div>
    </section>`;
  const clock = api.root.querySelector(".focus-ring strong");
  const label = api.root.querySelector(".focus-ring span");
  const progress = api.root.querySelector(".focus-progress");
  const toggle = api.root.querySelector('[data-action="toggle"]');
  function render() {
    const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");
    clock.textContent = `${minutes}:${seconds}`;
    label.textContent = phase === "focus" ? "专注" : "休息";
    progress.textContent = `今日 ${sessions} / ${target} 次`;
    toggle.textContent = running ? "暂停" : "开始";
    api.root.style.setProperty("--focus-progress", `${Math.min(100, sessions / target * 100)}%`);
  }
  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    render();
  }
  function start() {
    if (running) return stop();
    running = true;
    timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (phase === "focus") sessions += 1;
        phase = phase === "focus" ? "break" : "focus";
        remaining = phase === "focus" ? focus : rest;
        if (phase === "break" && !api.config.autoStartBreak) stop();
      }
      render();
    }, 1000);
    render();
  }
  toggle.addEventListener("click", start);
  api.root.querySelector('[data-action="reset"]').addEventListener("click", () => {
    stop();
    phase = "focus";
    remaining = focus;
    render();
  });
  render();
}
