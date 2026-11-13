# 汽車筆試練習網站 — 建置規格

目的：做成一個放在 GitHub 的作品。使用者可註冊登入，用完整題庫練題與模擬考，進度存雲端，跨裝置同步。
全部使用免費方案。不需要長期維護，但程式品質、README、測試要拿得出手。

## 已備好的素材（不要重做）

- `data/bank.json`：官方「新版汽車筆試題庫 115.5.29」全部 1090 題，由官方 PDF 直接解析，已驗證題數連續 1–1090、答案皆為 1–3。
  欄位：`n` 題號、`c` 架構（1 觀念與態度 1–424、2 主動停讓 425–654、3 安全駕駛能力 655–1090）、`q` 題目、`o` 三個選項、`a` 正解(1–3)、`img` 圖片路徑（192 題）、`full` 為 true 表示選項本身是圖片（共 6 題：183、185、233、523、723、1004，只能選 1/2/3）。
- `public/img/{n}.jpg`：192 張標誌、標線圖，已裁成只含圖片。
- `tools/`：解析 PDF 的腳本（parse.py → split.py → crops3.py），僅供重現資料來源，不要放 PDF 本身進 repo。

## 技術選擇（全免費）

- 前端：靜態網站，部署到 GitHub Pages。建議 Vite + TypeScript，不用大型框架，原生 DOM 或極小的 UI 層即可。要能在手機上好用，有淺色與深色主題。
- 後端：Supabase 免費方案，只用 Auth + Postgres + Row Level Security。不寫自己的伺服器。
  已查到的免費額度（來源 supabase.com/pricing）：每月 50,000 活躍使用者、資料庫 500 MB、2 個啟用中專案；**專案閒置 1 週會被暫停**，要在 README 說明如何恢復。
- 登入：Email + 密碼，另外有「訪客模式」（不登入也能練，進度存本機，登入後可選擇合併上傳）。Google 登入列為選配。
- 離線：加 PWA（manifest + service worker 快取題庫與圖片）。

## 功能

1. **背題模式**：先作答再看答案；答錯很快再出現，連續答對 2 次算熟；可依架構、圖片題、只看還不會的題篩選；可選「打亂文字選項順序」。
2. **模擬考**：預設 50 題（含圖片題，比例照題庫自然抽樣）、30 分鐘、每題 2 分，交卷前不顯示對錯，時間到自動交卷，可標記待檢查題。及格線用設定檔 `config.ts` 管理（預設 85 分），**介面要註明這是依一般說明設定，以監理站公告為準**。
3. **錯題本**：所有答錯過的題，附題庫題號；可匯出文字清單。
4. **統計頁**：各架構正確率、已熟題數進度條、模擬考歷史（分數、用時、錯題數）、連續練習天數。
5. **帳號**：註冊、登入、登出、忘記密碼、刪除帳號與所有資料（用 RPC 或 Edge Function，說明取捨）。
6. **同步**：進度逐題帶時間戳，同一題以較新者為準（Last-Writer-Wins）。要處理離線時累積、上線後再上傳。

## 資料表與權限（可直接用，請檢查後再採用）

```sql
create table public.progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  qno smallint not null check (qno between 1 and 1090),
  score smallint not null check (score between 0 and 2),
  updated_at timestamptz not null default now(),
  primary key (user_id, qno)
);
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  total smallint not null,
  wrong smallint not null,
  seconds int not null,
  passed boolean not null,
  wrong_qnos smallint[] not null default '{}'
);
alter table public.progress enable row level security;
alter table public.exam_attempts enable row level security;
-- 每張表都要有 select / insert / update / delete 四條政策，條件皆為 (select auth.uid()) = user_id，
-- insert 與 update 要同時有 with check。沒有政策就沒有權限。
```

安全要求：前端只使用 Supabase 的 anon key，它本來就是公開的；**service_role key 絕對不能出現在 repo 或前端**。README 要寫清楚哪些設定要自己填、放在哪裡（`.env`，並附 `.env.example`，`.gitignore` 排除 `.env`）。

## 品質要求

- 單元測試（Vitest）：計分、熟練度更新、時間戳合併、抽題邏輯。
- 端對端測試（Playwright）：訪客背題一輪、模擬考交卷、離線後上線同步。用假的 Supabase 轉接層測試，不連真實服務。
- 資料層用轉接介面（`LocalStore`、`SupabaseStore`），UI 不直接碰 Supabase，方便測試。
- GitHub Actions：push 時跑測試、型別檢查，並部署到 Pages。
- 無障礙：鍵盤可操作、對比足夠、圖片有 alt、讀屏器可用。
- README（繁體中文，附英文摘要）：做什麼、架構圖、如何自己架一份（建 Supabase 專案、貼 SQL、填環境變數、開 Pages）、已知限制、免責聲明、題庫出處與更新方式。

## 必須寫進 README 與網站的聲明

- 題庫來自交通部公路局公開的「新版汽車筆試題庫 115.5.29」，本站非官方，內容以監理站與公路局公告為準。
- 題庫可否重新公開散布，**專案擁有者上線前要自己確認公路局網站的授權條件**，並標明出處。若不確定，可以只在 repo 提供解析工具，不公開 `data/bank.json` 與圖片。
- 公開前請全面核對解析結果：目前只抽查過，沒有逐題比對。

## 需要專案擁有者自己做的事（我與 AI 都不能代勞）

1. 建立 Supabase 帳號與專案，執行 SQL，取得 URL 與 anon key，在 Auth 設定允許的網址與是否要求 Email 驗證。免費方案內建信件服務有寄送限制（細節以官方文件為準），示範用途可先關閉 Email 驗證，或接自己的 SMTP。
2. 建立 GitHub repo，設定 Pages 與 Actions，並把 Supabase 的 URL 與 anon key 設為 repo 變數。
3. 決定是否公開題庫資料（見上）。

## 完成的定義

- 全新電腦照 README 操作，可在 30 分鐘內架起自己的版本。
- 兩台裝置登入同一帳號，進度在 1 分鐘內一致。
- 訪客不登入也能完整練題。
- 所有測試通過，CI 綠燈，Lighthouse 的 PWA 與無障礙分數合理。
