# API: date_converter
Version: 0.1.0
Stage: dev
> 日期格式轉換草稿端點

## Intent
User wants to convert date, format timestamp, parse datetime

## Fields
- inputDate: string (輸入的日期字串)
- targetFormat: enum (目標格式)
  - ISO: ISO 8601 標準格式
  - TAIWAN_ROC: 民國紀年格式
  - UNIX_TS: Unix 時間戳

## Sample
- Semantic: 請幫我把 2026/09/22 轉成民國年格式
- Payload:
```json
{
  "inputDate": "2026/09/22",
  "targetFormat": "TAIWAN_ROC"
}
```

## Logic
```javascript
return {
  status: "CONVERTED",
  original: payload.inputDate,
  format: payload.targetFormat || "ISO",
  result: "民國 115 年 9 月 22 日"
};
```
