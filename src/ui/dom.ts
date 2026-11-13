/**
 * 極小的畫面工具：用 html`` 樣板產生字串，插入的值一律先跳脫，
 * 只有另一個 html`` 的結果（Safe）會原樣放入。這樣題庫文字、Email 等
 * 外部內容不可能變成可執行的標記。
 */
export class Safe {
  constructor(readonly s: string) {}
  toString() {
    return this.s;
  }
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
}

function render(v: unknown): string {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false || v === true) return '';
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new Safe(out);
}

export function mount(el: Element, content: Safe) {
  el.innerHTML = content.s;
}

export function $<T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

/** 事件委派：在 root 上監聽，只處理符合 selector 的目標。 */
export function on<K extends keyof HTMLElementEventMap>(
  root: Element,
  type: K,
  selector: string,
  handler: (event: HTMLElementEventMap[K], target: HTMLElement) => void,
) {
  root.addEventListener(type, (event) => {
    const target = (event.target as Element | null)?.closest?.(selector);
    if (target && root.contains(target)) handler(event as HTMLElementEventMap[K], target as HTMLElement);
  });
}

/** 複製文字到剪貼簿；被瀏覽器拒絕時回傳 false，呼叫端改為選取文字讓使用者手動複製。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
