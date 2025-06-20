// module.exports = router;
const express = require('express');
const router = express.Router();

const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

// Helpers
const buildSensorColumns = (sensorCount) =>
    [...Array(sensorCount)].map((_, i) => `sensor${i + 1}_temperature`);
const validateDateRange = (start, end) => {
    const s = new Date(start), e = new Date(end);
    if (isNaN(s) || isNaN(e)) return "Định dạng thời gian không hợp lệ";
    if (s >= e) return "Thời gian bắt đầu phải sớm hơn thời gian kết thúc";
    return null;
};
const formatTimestamp = (ts) => dayjs(ts).tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss");

function createSensorRoutes(tableName, sensorCount = 8) {
    const columns = buildSensorColumns(sensorCount).join(', ');

    // router.post(`/api/${tableName}`, async (req, res) => {
    //     const sensors = buildSensorColumns(sensorCount).map(col => req.body[col]);

    //     if (sensors.some(val => val == null)) {
    //         return res.status(400).json({ error: "Thiếu dữ liệu sensor" });
    //     }

    //     const placeholders = sensors.map((_, i) => `$${i + 1}`).join(', ');
    //     const query = `
    //   INSERT INTO iot.${tableName} (${columns}, timestamp)
    //   VALUES (${placeholders}, CURRENT_TIMESTAMP)
    //   RETURNING id;
    // `;

    //     try {
    //         const result = await req.client.query(query, sensors);
    //         res.status(201).json({ id: result.rows[0]?.id, message: "Thêm dữ liệu thành công" });
    //     } catch (error) {
    //         console.error(`❌ Lỗi thêm dữ liệu ${tableName}:`, error.message);
    //         res.status(500).json({ error: "Lỗi server" });
    //     }
    // });

    router.post(`/api/${tableName}`, async (req, res) => { 
    const sensors = buildSensorColumns(sensorCount).map(col => req.body[col]);

    // Bỏ qua nếu thiếu dữ liệu
    if (sensors.some(val => val == null)) {
        return res.sendStatus(204); // No Content
    }

    // Bỏ qua nếu có sensor không hợp lệ (<5 hoặc >700)
    if (sensors.some(val => val < 5 || val > 700)) {
        return res.sendStatus(204); // No Content
    }

    const placeholders = sensors.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
      INSERT INTO iot.${tableName} (${columns}, timestamp)
      VALUES (${placeholders}, CURRENT_TIMESTAMP)
      RETURNING id;
    `;

    try {
        const result = await req.client.query(query, sensors);
        res.status(201).json({ id: result.rows[0]?.id, message: "Thêm dữ liệu thành công" });
    } catch (error) {
        console.error(`❌ Lỗi thêm dữ liệu ${tableName}:`, error.message);
        res.sendStatus(500);
    }
    });

    router.get(`/api/${tableName}`, async (req, res) => {
        const { start_time, end_time } = req.query;
        const errorMsg = validateDateRange(start_time, end_time);
        if (errorMsg) return res.status(400).json({ error: errorMsg });

        try {
            const result = await req.client.query(`
        SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp, ${columns}
        FROM iot.${tableName}
        WHERE timestamp BETWEEN $1 AND $2
        ORDER BY timestamp ASC;
      `, [start_time, end_time]);

            res.status(200).json({ data: result.rows, start_time, end_time });
        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });

    router.get(`/api/daily/${tableName}`, async (req, res) => {
        const { date, start_time = "00:00:00", end_time = "23:59:59" } = req.query;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: "Định dạng ngày không hợp lệ (YYYY-MM-DD)" });
        }
        const errorMsg = validateDateRange(`${date} ${start_time}`, `${date} ${end_time}`);
        if (errorMsg) return res.status(400).json({ error: errorMsg });

        try {
            const result = await req.client.query(`
        SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp, ${columns}
        FROM iot.${tableName}
        WHERE timestamp BETWEEN $1 AND $2
        ORDER BY timestamp ASC;
      `, [`${date} ${start_time}`, `${date} ${end_time}`]);

            res.status(200).json({ data: result.rows, date, start_time, end_time });
        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });

    router.get(`/api/${tableName}/latest`, async (req, res) => {
        try {
            const result = await req.client.query(`
        SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp, ${columns}
        FROM iot.${tableName}
        ORDER BY timestamp DESC
        LIMIT 1;
      `);

            if (!result.rows.length) {
                return res.status(404).json({ error: `Không tìm thấy dữ liệu trong bảng ${tableName}` });
            }

            res.status(200).json({ data: result.rows[0], table: tableName });
        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu mới nhất ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });

    router.get(`/api/${tableName}/sample`, async (req, res) => {
        try {
            const { start_time, end_time, interval = 60 } = req.query;
            const errorMsg = validateDateRange(start_time, end_time);
            if (errorMsg) return res.status(400).json({ error: errorMsg });

            const intervalMs = parseInt(interval) * 60 * 1000;
            const start = new Date(start_time), end = new Date(end_time);

            const result = await req.client.query(`
        SELECT id, timestamp AS timestamp_utc, ${columns}
        FROM iot.${tableName}
        WHERE timestamp BETWEEN $1 AND $2
        ORDER BY timestamp ASC;
      `, [start, end]);

            const rawData = result.rows;
            if (!rawData.length) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });

            const sampleTimes = [];
            for (let t = start.getTime(); t <= end.getTime(); t += intervalMs) {
                sampleTimes.push(new Date(t));
            }

            const seenTimestamps = new Set();
            const maxDiff = 30 * 1000;
            const sampledData = sampleTimes.map(target => {
                let nearest = null, minDiff = Infinity;
                for (const row of rawData) {
                    const t = new Date(row.timestamp_utc);
                    const diff = Math.abs(t - target);
                    if (diff <= maxDiff && diff < minDiff && !seenTimestamps.has(row.timestamp_utc)) {
                        nearest = row;
                        minDiff = diff;
                    }
                }
                if (nearest) seenTimestamps.add(nearest.timestamp_utc);
                return nearest;
            }).filter(Boolean);

            const final = Array.from(new Set([
                ...sampledData,
                ...[start, end].map(bound => rawData.reduce((acc, cur) =>
                    Math.abs(new Date(cur.timestamp_utc) - bound) < Math.abs(new Date(acc.timestamp_utc) - bound) ? cur : acc
                ))
            ].map(row => row.timestamp_utc)))
                .map(ts => rawData.find(r => r.timestamp_utc === ts))
                .filter(Boolean);

            //   const isZeroRow = (row) => buildSensorColumns(sensorCount).every(col => row[col] === 0);
            //   const lastValid = [...rawData].reverse().find(r => !isZeroRow(r));
            //   if (isZeroRow(final[final.length - 1]) && lastValid) {
            //     final[final.length - 1] = lastValid;
            //   }

            const isZeroRow = (row) => buildSensorColumns(sensorCount).every(col => row[col] === 0);

            // xử lý điểm cuối cùng
            const lastValid = [...rawData].reverse().find(r => !isZeroRow(r));
            if (isZeroRow(final[final.length - 1]) && lastValid) {
                final[final.length - 1] = lastValid;
            }

            // xử lý điểm đầu tiên
            const firstValid = rawData.find(r => !isZeroRow(r));
            if (isZeroRow(final[0]) && firstValid) {
                final[0] = firstValid;
            }


            res.status(200).json({
                data: final.map(r => ({
                    id: r.id,
                    timestamp: formatTimestamp(r.timestamp_utc),
                    ...Object.fromEntries(buildSensorColumns(sensorCount).map(col => [col, r[col]]))
                })),
                meta: {
                    start_time: formatTimestamp(start),
                    end_time: formatTimestamp(end),
                    interval_minutes: parseInt(interval),
                    sample_count: final.length,
                    original_count: rawData.length,
                    timezone: "Asia/Ho_Chi_Minh (GMT+7)"
                }
            });
        } catch (error) {
            console.error(`❌ Lỗi lấy sample ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server", details: error.message });
        }
    });
}

['t4', 't5', 'g1', 'g2', 'g3'].forEach((table) => createSensorRoutes(table));
module.exports = router;
