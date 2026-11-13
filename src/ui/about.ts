import { CONFIG } from '../config';
import { BANK } from '../core/bank';
import { html, mount } from './dom';
import type { View } from './view';

export const aboutView: View = (root) => {
  const pics = BANK.filter((q) => q.img).length;
  mount(
    root,
    html`
      <h1 tabindex="-1">關於本站</h1>

      <section class="card" aria-labelledby="src-h">
        <h2 id="src-h">題庫來源</h2>
        <p>
          題庫資料來源：${CONFIG.bankSource}（${CONFIG.bankVersion} 版），共 ${BANK.length} 題，其中 ${pics} 題附有標誌或標線圖。依公路局「政府網站資料開放宣告」使用，並標示出處。
        </p>
        <p>
          <a href="https://www.thb.gov.tw/" target="_blank" rel="noopener">交通部公路局網站</a>
          <a href="https://www.thb.gov.tw/cp.aspx?n=439" target="_blank" rel="noopener">政府網站資料開放宣告</a>
        </p>
      </section>

      <section class="card" aria-labelledby="dis-h">
        <h2 id="dis-h">請注意</h2>
        <ul class="plain">
          <li>本站是個人製作的練習工具，<strong>不是官方網站</strong>，與交通部公路局、監理機關沒有關係，也未經其認可。</li>
          <li>題目是從官方 PDF 以程式整理而來，並做了分類與圖片裁切，可能有錯漏。內容以公路局與監理站公告為準。</li>
          <li>考試題數、時間與及格分數是依一般公開說明設定，可能與實際規定不同。</li>
          <li>正式考試另有危險感知影片題，本站沒有收錄，請用監理服務網的官方模擬系統練習。</li>
          <li>題庫會改版。本站收錄的是 ${CONFIG.bankVersion} 版，不保證與最新版一致。</li>
        </ul>
      </section>

      <section class="card" aria-labelledby="off-h">
        <h2 id="off-h">離線使用</h2>
        <p>開過一次之後，沒有網路也能背題和考試。登入的使用者離線時的作答會先存在裝置上，恢復連線後自動同步。可以用瀏覽器的「加入主畫面」把它裝成 App。</p>
      </section>

      <section class="card" aria-labelledby="code-h">
        <h2 id="code-h">原始碼</h2>
        <p>程式以 MIT 授權開放。題庫內容的權利屬於原提供機關，使用時請依其開放宣告標示出處。</p>
      </section>
    `,
  );
};
