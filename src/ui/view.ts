import type { App } from '../app';

export interface ViewHandle {
  /** 離開這一頁時清理計時器與全域事件。 */
  destroy?(): void;
  /** 資料在背景改變（例如另一台裝置同步過來）時重畫。 */
  refresh?(): void;
}

export type View = (root: HTMLElement, app: App, params: URLSearchParams) => ViewHandle | void;

export function go(path: string) {
  location.hash = `#${path}`;
}
