const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const targetUrl = process.argv[4];
const html = `<!doctype html><html><body>
<script>
window.name = ${JSON.stringify(JSON.stringify(rows))};
location.href = ${JSON.stringify(targetUrl)};
</script>
</body></html>`;
fs.writeFileSync(process.argv[3], html);
console.log("wrote carrier with", rows.length, "rows ->", process.argv[3]);
