# API: sales_analytics
Version: 1.5.0
Stage: prod
> 即時計算特定品類的銷售總額、訂單數量與平均客單價 (本地 DuckDB 0ms 向量聚合)

## Intent
User wants to query sales summary, category revenue, order analytics, or business metrics

## Store: analytics
- Provider: local_duckdb

## Fields
- category: string (商品品類，選填，如 Electronics, Books)
- minPrice: number (最低金額門檻，選填)

## Logic
```javascript
// 直接使用沙盒內建注入的 context.db (本地 DuckDB)
let sql = "SELECT category, COUNT(id) AS order_count, SUM(price) AS total_revenue, AVG(price) AS avg_price FROM orders";
const conditions = [];

if (payload.category) {
  conditions.push(`category = '${payload.category.replace(/'/g, "''")}'`);
}
if (payload.minPrice) {
  conditions.push(`price >= ${Number(payload.minPrice)}`);
}

if (conditions.length > 0) {
  sql += " WHERE " + conditions.join(" AND ");
}
sql += " GROUP BY category";

const result = await context.db.query(sql);

return {
  status: "CONFIRMED",
  analytics: result.rows,
  rowCount: result.rowCount,
  computeDurationMs: result.durationMs,
  generatedAt: new Date().toISOString()
};
```

## Sample
- Semantic: 請幫我分析電子產品 Electronics 的銷售總額與平均價格
- Payload:
```json
{
  "category": "Electronics",
  "minPrice": 100
}
```

## Mock
- status: CONFIRMED
- analytics: []
- rowCount: 0
