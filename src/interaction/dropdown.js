/**
 * Styled dropdowns over native <select>s. The select stays the source of
 * truth (its options, value and change events), so the app's code is
 * untouched; it is hidden behind an ARIA combobox button whose listbox opens
 * on the body, above every panel and clear of any scrolling container.
 */
const nativeValue = Object.getOwnPropertyDescriptor(
  HTMLSelectElement.prototype,
  "value",
);
let openMenu = null;
addEventListener("resize", () => openMenu?.close(false));
addEventListener(
  "scroll",
  (event) =>
    !(
      event.target instanceof Element && event.target.closest(".dropdownList")
    ) && openMenu?.close(false),
  true,
);

export function enhanceSelect(select) {
  const wrap = document.createElement("div");
  wrap.className = "dropdown";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dropdownTrigger";
  trigger.id = `${select.id}Button`;
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") ?? "");
  const label = document.createElement("span");
  trigger.append(label);
  const list = document.createElement("ul");
  list.className = "dropdownList";
  list.id = `${select.id}List`;
  list.setAttribute("role", "listbox");
  list.hidden = true;
  trigger.setAttribute("aria-controls", list.id);
  select.before(wrap);
  wrap.append(select, trigger);
  document.body.append(list);
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.classList.add("nativeSelect");

  const sync = () => {
    label.textContent = select.selectedOptions[0]?.textContent ?? "";
    wrap.hidden = select.hidden;
    trigger.disabled = select.disabled;
  };
  // Programmatic `select.value = …` fires no event; keep the label honest.
  Object.defineProperty(select, "value", {
    get: () => nativeValue.get.call(select),
    set: (value) => {
      nativeValue.set.call(select, value);
      sync();
    },
  });
  new MutationObserver(sync).observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled"],
  });
  select.addEventListener("change", sync);

  let active = -1;
  const mark = (index) => {
    active = index;
    [...list.children].forEach((li, i) =>
      li.classList.toggle("active", i === index),
    );
    const li = list.children[index];
    if (!li) return;
    trigger.setAttribute("aria-activedescendant", li.id);
    li.scrollIntoView({ block: "nearest" });
  };
  const close = (refocus = true) => {
    if (list.hidden) return;
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    openMenu = null;
    if (refocus) trigger.focus();
  };
  const choose = (index) => {
    const option = select.options[index];
    if (option && !option.disabled && select.selectedIndex !== index) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close();
  };
  const show = () => {
    openMenu?.close(false);
    list.replaceChildren(
      ...[...select.options].map((option, i) => {
        const li = document.createElement("li");
        li.id = `${list.id}-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(option.selected));
        if (option.disabled) li.setAttribute("aria-disabled", "true");
        li.textContent = option.textContent;
        li.addEventListener("click", () => choose(i));
        li.addEventListener("pointermove", () => mark(i));
        return li;
      }),
    );
    list.hidden = false;
    // Open above the button when the HUD sits low on the screen.
    const box = trigger.getBoundingClientRect();
    const below = innerHeight - box.bottom;
    const up = below < list.offsetHeight + 8 && box.top > below;
    list.style.minWidth = `${box.width}px`;
    list.style.left = `${Math.min(box.left, innerWidth - list.offsetWidth - 8)}px`;
    list.style.top = up ? "" : `${box.bottom + 6}px`;
    list.style.bottom = up ? `${innerHeight - box.top + 6}px` : "";
    list.classList.toggle("up", up);
    trigger.setAttribute("aria-expanded", "true");
    mark(select.selectedIndex);
    openMenu = { close };
  };

  // Clicks in the menu must not steal focus from the combobox.
  list.addEventListener("pointerdown", (event) => event.preventDefault());
  trigger.addEventListener("blur", () => close(false));
  let spaceChose = false;
  trigger.addEventListener("click", () => {
    if (spaceChose) spaceChose = false;
    else if (list.hidden) show();
    else close();
  });
  trigger.addEventListener("keydown", (event) => {
    const last = select.options.length - 1;
    if (list.hidden) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      show();
    } else if (event.key === "ArrowDown") mark(Math.min(last, active + 1));
    else if (event.key === "ArrowUp") mark(Math.max(0, active - 1));
    else if (event.key === "Home") mark(0);
    else if (event.key === "End") mark(last);
    else if (event.key === "Enter") choose(active);
    else if (event.key === " ") {
      spaceChose = true; // the button's own click follows on keyup
      choose(active);
    } else if (event.key === "Escape") close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  sync();
}
