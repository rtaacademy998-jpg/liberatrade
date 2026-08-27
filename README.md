# Libera Analysts

แพลตฟอร์มข่าวและบทวิเคราะห์ตลาดโลกภาษาไทย — หุ้น, Forex, Crypto, Commodities
พร้อมระบบสมาชิก 3 ระดับ

สร้างจาก design handoff ใน [`design_handoff_libera_analysts/`](design_handoff_libera_analysts/README.md)
โดเมนที่จองไว้: **Liberatrade.com** · แบรนด์ในดีไซน์: **libera.co**

---

## เริ่มใช้งาน

```bash
python serve.py
```

เปิด <http://localhost:8080> อัตโนมัติ
(`python serve.py 3000` เปลี่ยนพอร์ต · `--no-open` ไม่เปิดเบราว์เซอร์)

> **ต้องเปิดผ่านเซิร์ฟเวอร์** — ดับเบิลคลิก `index.html` ไม่ทำงาน เพราะหน้าเว็บใช้
> ES modules + `fetch()` ซึ่งเบราว์เซอร์บล็อกบน `file://`

ราคาสดตั้งค่าอย่างไร — ดูหัวข้อถัดไป

---

## ราคาสด — อัปเดตทุก 5 นาที

**ไม่ต้องใช้ API key** ใช้ได้ทันที

```bash
start.bat
```

เปิด 2 หน้าต่าง: เว็บเซิร์ฟเวอร์ + ตัวดึงราคาที่รีเฟรชทุก 5 นาที
หรือรันแยก:

```bash
python -u tools/fetch_quotes.py
```

`--once` ดึงรอบเดียว · `--interval 900` ทุก 15 นาที · `--symbols XAUUSD,BTCUSD` เลือกเฉพาะบางตัว

### แหล่งข้อมูล

| กลุ่ม | แหล่ง | คีย์ |
|---|---|---|
| ดัชนี · หุ้น · Forex · Crypto | Yahoo Finance | ไม่ต้อง |
| ทอง · เงิน · แพลทินัม · ทองแดง (**Spot**) | gold-api.com | ไม่ต้อง |
| น้ำมัน WTI | Yahoo (front-month futures) | ไม่ต้อง |

**ได้ดัชนีตัวจริง ไม่ใช่ ETF** — S&P 500 = 7,675 (ไม่ใช่ SPY 766) และมี **SET Index** ด้วย
ทุกตัวมีราคาปิดวันก่อนจริง → % เปลี่ยนแปลงถูกต้องตั้งแต่รอบแรก
กราฟใช้เส้นราคาระหว่างวันจริงจาก Yahoo ไม่ใช่เส้นสังเคราะห์

**โภคภัณฑ์เป็น Spot ทั้งหมด** ยกเว้นน้ำมัน — ไม่มีแหล่ง spot ฟรีสำหรับน้ำมันดิบ
ทั้งตลาดอ้างอิงสัญญาเดือนใกล้ (front-month) จึงตั้งชื่อตามจริงว่า "WTI Crude (front-month)"

### ⚠️ ก่อนขึ้นโดเมนจริงและเก็บเงินค่าสมาชิก

**Yahoo Finance เป็น endpoint ที่ไม่เป็นทางการ และเงื่อนไขการใช้งานห้ามนำข้อมูลไปเผยแพร่ต่อในเชิงพาณิชย์**

ใช้ทดสอบ/พัฒนาได้ แต่**ไม่ใช่สิทธิ์ในการเปิดเว็บขายสมาชิก $189/$369**
ก่อนเก็บเงินจริงต้องย้ายไปใช้ฟีดที่มีสัญญา เช่น Twelve Data, Polygon,
Finnhub, EOD Historical Data หรือฟีดจากโบรกเกอร์

**แก้แค่ตาราง `SOURCES` ใน `tools/fetch_quotes.py` ที่เดียว** ส่วนอื่นไม่ต้องแตะ

ไฟล์ยังรองรับ Alpha Vantage อยู่ (`--provider alphavantage` + คีย์ใน `config.local.json`)
แต่ฟรีแค่ 25 requests/วัน ทำ 5 นาทีไม่ได้

### หน้าเว็บทำอะไรบ้าง

- ดึง `data/quotes.json` ซ้ำทุก `refreshSeconds` (300 = 5 นาที)
- **หยุดดึงเมื่อสลับแท็บออก** แล้วตามให้ทันตอนกลับมา
- ราคาที่ขยับ**กะพริบสั้น ๆ** เขียว/แดง (ปิดเองถ้าตั้ง reduce motion)
- Ticker **แก้ตัวเลขในที่เดิม** แถบเลื่อนไม่กระตุก
- มุมขวาบนมีจุดสถานะ + เวลาอัปเดต **กดดึงทันที**ได้
- **ดึงไม่สำเร็จ = คงราคาเดิมไว้** จุดเปลี่ยนเป็นแดง ไม่เคลียร์จอทิ้ง

### ความปลอดภัยของข้อมูล

- เขียนไฟล์แบบ atomic — คนอ่านไม่มีทางเจอไฟล์ครึ่ง ๆ
- **merge ไม่ใช่ทับ** — ใช้ `--symbols` แล้วตัวที่ไม่ได้ดึงยังอยู่ครบ
- เปลี่ยนหน่วยราคา (เช่น ทองแดง ton → lb) จะล้างประวัติเดิม ไม่คำนวณ % เพี้ยน

---

## หน้าที่มี

| หน้า | ไฟล์ | ตรงกับแคนวาส |
|---|---|---|
| หน้าแรก | [index.html](index.html) | `4a` (+ state `6a`/`6b`) |
| บทวิเคราะห์เชิงลึก | [analysis.html?s=xauusd](analysis.html) · `?s=us30` | `7a` · `8a` |
| สินทรัพย์รายตัว | [asset.html?s=NVDA](asset.html) · `?s=XAUUSD` · `?s=US30` | `2a` |
| บทความ | [article.html?a=cpi-decision-night](article.html) | `2b` |
| Paywall | [paywall.html?a=ai-infra-q2](paywall.html) | `3b` |
| แพ็คเกจสมาชิก | [pricing.html](pricing.html) | `3a` |

### ดูสถานะสมาชิกทั้ง 3 แบบ

มุมขวาบนมีดรอปดาวน์ **"ดูอย่าง Free / Pro / Exclusive"** (กรอบเส้นประ)
กดเปลี่ยนแล้วทั้งหน้าจะ re-render ตามสิทธิ์ทันที — badge, watchlist, คำแนะนำ,
Model Portfolio, Live Q&A, แจ้งเตือนเรียลไทม์, จุดเขียว "ข้อมูลเรียลไทม์"

ตัวเลือกนี้มีไว้รีวิวดีไซน์เท่านั้น **ของจริง tier มาจาก session ผู้ใช้เปลี่ยนเองไม่ได้**

---

## โครงสร้างไฟล์

```
D:\Web AI\
├── index.html  analysis.html  asset.html
├── article.html  paywall.html  pricing.html
├── serve.py                     เซิร์ฟเวอร์ dev (stdlib ล้วน)
├── assets/
│   ├── css/
│   │   ├── tokens.css           ★ ตัวแปรสีทั้งหมด (Editorial + Terminal)
│   │   ├── base.css             reset, typography, primitives
│   │   ├── layout.css           masthead, nav, ticker, grid, footer, responsive
│   │   └── components.css       cards, pricing, paywall, scenario, levels…
│   └── js/
│       ├── store.js             ★ session, entitlements, data access, theme
│       ├── format.js            ราคา / % / วันที่ภาษาไทย
│       ├── charts.js            sparkline + กราฟราคาพร้อมแนวรับแนวต้าน
│       ├── chrome.js            page chrome ที่ใช้ร่วมทุกหน้า
│       ├── article-view.js      ตัวเรนเดอร์บทความ (ใช้ทั้ง article + paywall)
│       └── home.js analysis.js asset.js article.js paywall.js pricing.js
├── data/                        ★ เปลี่ยนข้อมูลที่นี่ ไม่ต้องแก้โค้ด
│   ├── quotes.json              ราคา 17 สินทรัพย์ (สด) + sparkline
│   ├── series.json              เส้นราคาระหว่างวัน 90 จุด/สินทรัพย์
│   ├── articles.json            บทความ + ผู้เขียน + requiredTier
│   ├── analysis.json            หน้าวิเคราะห์เชิงลึก (ทอง, US30)
│   ├── assets.json              ข้อมูลพื้นฐานรายสินทรัพย์
│   └── desk.json                คำแนะนำ, ปฏิทิน, แจ้งเตือน, พอร์ต, แพ็คเกจ
├── tools/
│   ├── fetch_quotes.py          ★ ดึงราคาจริง อัปเดตทุก 5 นาที
│   ├── seed_live.py             เขียนสแนปช็อตราคาจริงลงไฟล์ (รอบเดียว)
│   └── build_data.py            ตัวสร้างข้อมูลสมมติเดิม (เก็บไว้อ้างอิง)
├── start.bat                    เปิดเว็บ + ตัวดึงราคาพร้อมกัน
├── config.local.json            ★ API key (git-ignored, ต้องสร้างเอง)
├── design_handoff_libera_analysts/   ต้นฉบับดีไซน์ (อ้างอิง ไม่ใช่โค้ดใช้งาน)
└── trading-dashboard/           แดชบอร์ดพอร์ตเทรดที่ทำไว้ก่อนหน้า (ยังเปิดได้)
```

แดชบอร์ดเดิมอยู่ที่ <http://localhost:8080/trading-dashboard/>

---

## ระบบสมาชิก (entitlements)

สิทธิ์ทั้งหมด **derive จาก tier** ไม่เก็บซ้ำ อยู่ใน `assets/js/store.js`

| | Free | Pro `$189` | Exclusive `$369` |
|---|---|---|---|
| ราคาตลาด | ล่าช้า 15 นาที | ล่าช้า 15 นาที | **เรียลไทม์** |
| Watchlist | 1 รายการ | ไม่จำกัด | ไม่จำกัด |
| บทวิเคราะห์ | เฉพาะที่ติด FREE | ตาม `requiredTier` | ทุกชิ้น |
| แจ้งเตือนเรียลไทม์ | — | ✓ | ✓ + call trigger |
| คำแนะนำรายสินทรัพย์ | teaser เบลอ | teaser เบลอ | **ตารางเต็ม 5 คอลัมน์** |
| Model Portfolio · Live Q&A | — | — | ✓ |

**การล็อกเนื้อหาเป็นรายบทความ (`requiredTier`) ไม่ใช่รายหมวดสินทรัพย์** —
เพราะหน้า `6a` แสดง Equities ล็อกสำหรับ Pro เนื่องจากบทความชิ้นนั้นตั้งเป็น
Exclusive ไม่ใช่เพราะหมวด Equities ถูกล็อกทั้งหมด

> ⚠️ **มาสก์และ 🔒 ในหน้าเว็บเป็นแค่การแสดงผล ไม่ใช่การบังคับสิทธิ์**
> ตอนต่อ backend จริง API ต้องตัดเนื้อหาที่ tier นั้นอ่านไม่ได้ออกจาก payload
> ตั้งแต่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ส่งมาครบแล้วเบลอด้วย CSS

---

## Design tokens

แก้สีทั้งเว็บได้ที่ [`assets/css/tokens.css`](assets/css/tokens.css) ที่เดียว

- **Editorial (สว่าง)** — ทิศทางหลัก พื้นกระดาษหนังสือพิมพ์อุ่น `#faf8f2`, accent `#a4441f`
- **Terminal (มืด)** — จากตัวเลือก `1a` พื้น `#0c0f16`, accent เป็นทอง `#d4a72c`

ค่าโหมดมืดประกาศทั้งใน `@media (prefers-color-scheme: dark)` และ `[data-theme="dark"]`
เพื่อให้ปุ่มสลับธีมชนะทั้งสองทาง — ตรวจแล้วผ่าน WCAG AA ทุกคู่สี (ต่ำสุด 5.77:1)

ฟอนต์: `IBM Plex Sans Thai` (UI) · `Trirong` (พาดหัว) · `IBM Plex Mono` (ตัวเลขทุกตัว)
โหลดจาก Google Fonts — **production ควร self-host**

---

## สิ่งที่ต่างจาก handoff (ตั้งใจ)

1. **Stack** — handoff แนะนำ Next.js แต่เครื่องนี้ไม่มี Node.js จึงทำเป็น
   HTML/CSS/JS ล้วน โครงสร้างแยก tokens → components → page controllers
   ให้ย้ายเข้า React/Vue ได้ตรง ๆ ภายหลัง
2. **ราคาทองคำ** — แคนวาสหน้าแรก (`4a`) แสดง `3,342.10` แต่หน้าวิเคราะห์ (`7a`)
   แสดง `4,106.03` โดย handoff ระบุว่า `7a`/`8a` สร้างจากข้อมูลจริง
   **จึงยึด `4,106.03` เป็นค่าเดียวทั้งเว็บ**
3. **กราฟ** — เส้น SVG ในแคนวาสเป็น path วาดมือ (placeholder) ที่นี่วาดจาก
   ราคาจริงใน `series.json` และวางเส้นแนวรับ/แนวต้านตาม**ราคา** ไม่ใช่ตามพิกเซล
4. **Ticker** — แคนวาสเป็นภาพนิ่งถูก clip ที่นี่ทำเป็น marquee เลื่อนจริง
   หยุดเมื่อเอาเมาส์ชี้ และย่อเลขหลักแสนเป็น `108.9k` ตามสเปกมือถือ
5. **page chrome** — ประกอบด้วย JS เพื่อให้มีนิยามเดียว ตอนย้ายเข้า framework
   จริงควรเป็น server component เพื่อให้ markup ติดมากับ HTML response (SEO)

---

## ที่ทดสอบแล้ว

วัดค่าจริงในเบราว์เซอร์ ไม่ใช่ตรวจด้วยสายตา:

- ทั้ง 8 หน้าโหลดโดยไม่มี error ใน console และไม่มีอะไรค้างที่ "กำลังโหลด"
- ไม่มี horizontal overflow ทั้งเดสก์ท็อป (1280) และมือถือ (375)
- มือถือ: hamburger + bottom tab bar + market grid 2×2 + ปิด border คอลัมน์หลัก
- สลับ tier ทั้ง 3 ระดับ → ทุก surface เปลี่ยนสอดคล้องกัน
- Paywall: 1 ย่อหน้าฟรี + 1 ย่อหน้าเบลอ + กล่อง CTA และเมื่ออัปเกรดจะสลับ URL
  ไปหน้าบทความเต็มเอง
- Pricing: toggle รายปี −20% ถูกต้อง (`$189→$151`, `$369→$295`), ribbon ลอยเหนือ
  การ์ดและอยู่กึ่งกลางพอดี, การ์ดสูงเท่ากันทั้ง 3
- กราฟ: เส้นแนวรับ/ต้าน/pivot เรียงตามราคาถูกต้อง label ไม่ชนกันและเส้นราคา
  ไม่วิ่งทับตัวหนังสือ

**ยังไม่ได้ทดสอบด้วยตา** — Browser pane ในเซสชันนี้ไม่ compositing จึงถ่าย
screenshot ไม่ได้ รบกวนเปิดดูจริงอีกรอบ

---

## งานที่ยังไม่ได้ทำ

- [ ] Backend จริง + บังคับสิทธิ์ฝั่งเซิร์ฟเวอร์ (สำคัญที่สุด)
- [ ] ราคาเรียลไทม์ผ่าน WebSocket/SSE สำหรับ Exclusive (ตอนนี้เป็น polling 5 นาที)
- [ ] หาแหล่งข้อมูล SET Index และราคาดัชนีจริง (ไม่ใช่ ETF proxy)
- [ ] หน้า checkout / ชำระเงิน (PromptPay + บัตรเครดิต)
- [ ] หน้า Watchlist เต็ม, Screener, ปฏิทินเศรษฐกิจเต็ม
- [ ] ภาพจริงแทนบล็อกลายทแยง (`.ph`) — ขนาดในโค้ดมีผลต่อ layout
- [ ] self-host ฟอนต์
- [ ] deploy ขึ้น Liberatrade.com
