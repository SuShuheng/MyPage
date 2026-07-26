export function activate(api) {
  let current = new Date();
  current = new Date(current.getFullYear(), current.getMonth(), 1);
  api.root.innerHTML = '<section class="calendar-shell"><header><button data-move="-1" aria-label="上个月">‹</button><strong></strong><button data-move="1" aria-label="下个月">›</button></header><div class="calendar-grid"></div><button class="calendar-today">回到今天</button></section>';
  const title = api.root.querySelector("strong");
  const grid = api.root.querySelector(".calendar-grid");
  function render() {
    const firstDay = Number(api.config.firstDay ?? 1);
    const labels = firstDay === 1 ? ["一","二","三","四","五","六","日"] : ["日","一","二","三","四","五","六"];
    const year = current.getFullYear();
    const month = current.getMonth();
    title.textContent = `${year} 年 ${month + 1} 月`;
    const offset = (new Date(year, month, 1).getDay() - firstDay + 7) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    const previous = new Date(year, month, 0).getDate();
    const cells = [];
    if (api.config.showWeekdayLabels !== false) labels.forEach((label) => cells.push(`<b>${label}</b>`));
    for (let index = 0; index < 42; index += 1) {
      const day = index - offset + 1;
      let value = day;
      let adjacent = false;
      if (day < 1) { value = previous + day; adjacent = true; }
      else if (day > total) { value = day - total; adjacent = true; }
      const today = new Date();
      const active = !adjacent && year === today.getFullYear() && month === today.getMonth() && value === today.getDate();
      cells.push(`<span class="${adjacent ? "is-adjacent " : ""}${active ? "is-today" : ""}" ${adjacent && api.config.showAdjacentDays === false ? "hidden" : ""}>${value}</span>`);
    }
    grid.innerHTML = cells.join("");
  }
  api.root.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() + Number(button.dataset.move), 1);
    render();
  }));
  api.root.querySelector(".calendar-today").addEventListener("click", () => {
    const now = new Date();
    current = new Date(now.getFullYear(), now.getMonth(), 1);
    render();
  });
  render();
}
