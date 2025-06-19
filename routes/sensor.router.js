const express = require('express');
const router = express.Router();

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const createSensorRoutes = (tableName, sensorCount = 8) => {
    router.post(`/api/${tableName}`, async (req, res) => {
        try {
            const sensors = [...Array(sensorCount)].map((_, i) =>
                req.body[`sensor${i + 1}_temperature`]
            );

            if (sensors.some(val => val == null)) {
                return res.status(400).json({ error: "Thiếu dữ liệu sensor" });
            }

            const placeholders = sensors.map((_, i) => `$${i + 1}`).join(', ');
            const columns = [...Array(sensorCount)]
                .map((_, i) => `sensor${i + 1}_temperature`)
                .join(', ');

            const query = `
                INSERT INTO iot.${tableName} (${columns}, timestamp)
                VALUES (${placeholders}, CURRENT_TIMESTAMP)
                RETURNING id;
            `;

            const result = await req.client.query(query, sensors);
            const newId = result.rows[0]?.id;

            if (!newId) {
                throw new Error("Không thể lấy ID mới");
            }

            res.status(201).json({ id: newId, message: "Thêm dữ liệu thành công" });
        } catch (error) {
            console.error(`❌ Lỗi thêm dữ liệu ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });
    router.get(`/api/daily/${tableName}`, async (req, res) => {
        try {
            const { date, start_time = "00:00:00", end_time = "23:59:59" } = req.query;

            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ error: "Định dạng ngày không hợp lệ (YYYY-MM-DD)" });
            }

            const startDateTime = `${date} ${start_time}`;
            const endDateTime = `${date} ${end_time}`;

            if (new Date(startDateTime) >= new Date(endDateTime)) {
                return res.status(400).json({ error: "Thời gian bắt đầu phải sớm hơn thời gian kết thúc" });
            }

            const columns = [...Array(sensorCount)]
                .map((_, i) => `sensor${i + 1}_temperature`)
                .join(', ');

            const result = await req.client.query(`
                SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp,
                    ${columns}
                FROM iot.${tableName}
                WHERE timestamp BETWEEN $1 AND $2
                ORDER BY timestamp ASC
            `, [startDateTime, endDateTime]);

            res.status(200).json({
                data: result.rows,
                date, start_time, end_time,
            });
        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });
    router.get(`/api/${tableName}`, async (req, res) => {
        try {
            const { start_time, end_time } = req.query;

            if (!start_time || !end_time) {
                return res.status(400).json({ error: "Thiếu start_time hoặc end_time" });
            }

            const startDate = new Date(start_time);
            const endDate = new Date(end_time);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({ error: "Định dạng thời gian không hợp lệ (YYYY-MM-DD HH:mm:ss hoặc ISO 8601)" });
            }

            if (startDate >= endDate) {
                return res.status(400).json({ error: "Thời gian bắt đầu phải sớm hơn thời gian kết thúc" });
            }

            const columns = [...Array(sensorCount)]
                .map((_, i) => `sensor${i + 1}_temperature`)
                .join(', ');

            const result = await req.client.query(`
                SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp,
                    ${columns}
                FROM iot.${tableName}
                WHERE timestamp BETWEEN $1 AND $2
                ORDER BY timestamp ASC
            `, [start_time, end_time]);

            res.status(200).json({
                data: result.rows,
                start_time,
                end_time,
            });
        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });
    router.get(`/api/${tableName}/latest`, async (req, res) => {
        try {
            const columns = [...Array(sensorCount)]
                .map((_, i) => `sensor${i + 1}_temperature`)
                .join(', ');

            const query = `
                SELECT id, TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS timestamp,
                    ${columns}
                FROM iot.${tableName}
                ORDER BY timestamp DESC
                LIMIT 1;
            `;

            const result = await req.client.query(query);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: `Không tìm thấy dữ liệu trong bảng ${tableName}`
                });
            }

            res.status(200).json({
                data: result.rows[0],
                table: tableName
            });
        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu mới nhất ${tableName}:`, error.message);
            res.status(500).json({ error: "Lỗi server" });
        }
    });
    // router.get(`/api/${tableName}/sample`, async (req, res) => {
    //     const formatLocalTimestamp = (ts) => {
    //         const date = new Date(ts);
    //         const pad = (n) => String(n).padStart(2, '0');
    //         return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    //     };

    //     try {
    //         const { start_time, end_time, interval = 60 } = req.query;

    //         if (!start_time || !end_time) {
    //             return res.status(400).json({ error: "Thiếu start_time hoặc end_time" });
    //         }

    //         const startUTC = new Date(start_time);
    //         const endUTC = new Date(end_time);

    //         if (isNaN(startUTC.getTime()) || isNaN(endUTC.getTime())) {
    //             return res.status(400).json({ error: "Định dạng thời gian không hợp lệ" });
    //         }

    //         if (startUTC >= endUTC) {
    //             return res.status(400).json({ error: "Thời gian bắt đầu phải sớm hơn thời gian kết thúc" });
    //         }

    //         const columns = [...Array(sensorCount)]
    //             .map((_, i) => `sensor${i + 1}_temperature`)
    //             .join(', ');

    //         const result = await req.client.query(`
    //         SELECT id, timestamp AS timestamp_utc, ${columns}
    //         FROM iot.${tableName}
    //         WHERE timestamp BETWEEN $1 AND $2
    //         ORDER BY timestamp ASC
    //     `, [startUTC, endUTC]);

    //         const rawData = result.rows;
    //         if (!rawData.length) {
    //             return res.status(404).json({ error: "Không tìm thấy dữ liệu" });
    //         }

    //         const sampleIntervalMs = parseInt(interval) * 60 * 1000;
    //         const samplePoints = [];
    //         let currentTime = new Date(startUTC);

    //         while (currentTime <= endUTC) {
    //             samplePoints.push(new Date(currentTime));
    //             currentTime = new Date(currentTime.getTime() + sampleIntervalMs);
    //         }

    //         const seenTimestamps = new Set();
    //         const maxDiffMs = 30 * 1000;

    //         const sampledData = samplePoints.map(targetTime => {
    //             let closestRecord = null;
    //             let minDiff = Infinity;

    //             rawData.forEach(record => {
    //                 const recordTime = new Date(record.timestamp_utc);
    //                 const diff = Math.abs(recordTime - targetTime);

    //                 if (diff < minDiff && diff <= maxDiffMs && !seenTimestamps.has(record.timestamp_utc)) {
    //                     minDiff = diff;
    //                     closestRecord = record;
    //                 }
    //             });

    //             if (closestRecord) {
    //                 seenTimestamps.add(closestRecord.timestamp_utc);
    //                 return { ...closestRecord };
    //             }

    //             return null;
    //         }).filter(Boolean);

    //         const addBoundaryPoint = (time) => {
    //             const exists = sampledData.some(d =>
    //                 Math.abs(new Date(d.timestamp_utc) - time) < 1000
    //             );

    //             if (!exists) {
    //                 let closestRecord = null;
    //                 let minDiff = Infinity;

    //                 rawData.forEach(record => {
    //                     const diff = Math.abs(new Date(record.timestamp_utc) - time);
    //                     if (diff < minDiff) {
    //                         minDiff = diff;
    //                         closestRecord = record;
    //                     }
    //                 });

    //                 if (closestRecord) {
    //                     sampledData.push({ ...closestRecord });
    //                 }
    //             }
    //         };

    //         addBoundaryPoint(startUTC);
    //         addBoundaryPoint(endUTC);

    //         const responseData = sampledData
    //             .map(item => ({
    //                 id: item.id,
    //                 timestamp: formatLocalTimestamp(item.timestamp_utc),
    //                 ...Object.fromEntries(
    //                     columns.split(', ').map(col => [col, item[col]])
    //                 )
    //             }))
    //             .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    //         console.log('First 3 records:', responseData.slice(0, 3));
    //         console.log('Last 3 records:', responseData.slice(-3));

    //         res.status(200).json({
    //             data: responseData,
    //             meta: {
    //                 start_time: formatLocalTimestamp(startUTC),
    //                 end_time: formatLocalTimestamp(endUTC),
    //                 interval_minutes: parseInt(interval),
    //                 sample_count: responseData.length,
    //                 original_count: rawData.length,
    //                 timezone: "Asia/Ho_Chi_Minh (GMT+7)"
    //             }
    //         });

    //     } catch (error) {
    //         console.error(`❌ Lỗi lấy dữ liệu ${tableName}:`, error);
    //         res.status(500).json({
    //             error: "Lỗi server",
    //             details: error.message,
    //             hint: "Kiểm tra log server để biết thêm chi tiết"
    //         });
    //     }
    // });


    router.get(`/api/${tableName}/sample`, async (req, res) => {
        const formatLocalTimestamp = (ts) => {
            const date = new Date(ts);
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        try {
            const { start_time, end_time, interval = 60 } = req.query;

            if (!start_time || !end_time) {
                return res.status(400).json({ error: "Thiếu start_time hoặc end_time" });
            }

            const startUTC = new Date(start_time);
            const endUTC = new Date(end_time);

            if (isNaN(startUTC.getTime()) || isNaN(endUTC.getTime())) {
                return res.status(400).json({ error: "Định dạng thời gian không hợp lệ" });
            }

            if (startUTC >= endUTC) {
                return res.status(400).json({ error: "Thời gian bắt đầu phải sớm hơn thời gian kết thúc" });
            }

            const columns = [...Array(sensorCount)]
                .map((_, i) => `sensor${i + 1}_temperature`)
                .join(', ');

            const result = await req.client.query(`
            SELECT id, timestamp AS timestamp_utc, ${columns}
            FROM iot.${tableName}
            WHERE timestamp BETWEEN $1 AND $2
            ORDER BY timestamp ASC
        `, [startUTC, endUTC]);

            const rawData = result.rows;
            if (!rawData.length) {
                return res.status(404).json({ error: "Không tìm thấy dữ liệu" });
            }

            const sampleIntervalMs = parseInt(interval) * 60 * 1000;
            const samplePoints = [];
            let currentTime = new Date(startUTC);

            while (currentTime <= endUTC) {
                samplePoints.push(new Date(currentTime));
                currentTime = new Date(currentTime.getTime() + sampleIntervalMs);
            }

            const isZeroSensor = (record) => {
                return [...Array(sensorCount)].every((_, i) => record[`sensor${i + 1}_temperature`] === 0);
            };

            const seenTimestamps = new Set();
            const maxDiffMs = 30 * 1000;
            
            const sampledData = samplePoints.map(targetTime => {
                let closestRecord = null;
                let minDiff = Infinity;

                rawData.forEach(record => {
                    const recordTime = new Date(record.timestamp_utc);
                    const diff = Math.abs(recordTime - targetTime);
                    const recordKey = `${record.timestamp_utc}`; // dùng để kiểm tra trùng timestamp

                    if (diff < minDiff && diff <= maxDiffMs && !seenTimestamps.has(recordKey)) {
                        minDiff = diff;
                        closestRecord = record;
                    }
                });

                if (closestRecord) {
                    const recordKey = `${closestRecord.timestamp_utc}`;
                    seenTimestamps.add(recordKey);
                    return { ...closestRecord };
                }

                return null;
            }).filter(Boolean);


            const addBoundaryPoint = (time) => {
                const exists = sampledData.some(d =>
                    Math.abs(new Date(d.timestamp_utc) - time) < 1000
                );

                if (!exists) {
                    let closestRecord = null;
                    let minDiff = Infinity;

                    rawData.forEach(record => {
                        const diff = Math.abs(new Date(record.timestamp_utc) - time);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closestRecord = record;
                        }
                    });

                    if (closestRecord) {
                        sampledData.push({ ...closestRecord });
                    }
                }
            };

            addBoundaryPoint(startUTC);
            addBoundaryPoint(endUTC);


            // Loại bỏ trùng sau khi thêm mốc biên
            const uniqueSampledData = [];
            const seen = new Set();

            for (const d of sampledData) {
                const key = d.timestamp_utc;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueSampledData.push(d);
                }
            }

            // Thay thế bản ghi cuối nếu toàn 0
            uniqueSampledData.sort((a, b) => new Date(a.timestamp_utc) - new Date(b.timestamp_utc));

            const last = uniqueSampledData[uniqueSampledData.length - 1];

            if (isZeroSensor(last)) {
                const alt = rawData
                    .filter(rec =>
                        new Date(rec.timestamp_utc) < endUTC &&
                        !isZeroSensor(rec)
                    )
                    .sort((a, b) =>
                        Math.abs(new Date(a.timestamp_utc) - endUTC) - Math.abs(new Date(b.timestamp_utc) - endUTC)
                    )[0];

                if (alt) {
                    uniqueSampledData[uniqueSampledData.length - 1] = { ...alt };
                }
            }


            const responseData = uniqueSampledData
                .map(item => ({
                    id: item.id,
                    timestamp: formatLocalTimestamp(item.timestamp_utc),
                    ...Object.fromEntries(
                        columns.split(', ').map(col => [col, item[col]])
                    )
                }))
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            console.log('First 3 records:', responseData.slice(0, 3));
            console.log('Last 3 records:', responseData.slice(-3));

            res.status(200).json({
                data: responseData,
                meta: {
                    start_time: formatLocalTimestamp(startUTC),
                    end_time: formatLocalTimestamp(endUTC),
                    interval_minutes: parseInt(interval),
                    sample_count: responseData.length,
                    original_count: rawData.length,
                    timezone: "Asia/Ho_Chi_Minh (GMT+7)"
                }
            });

        } catch (error) {
            console.error(`❌ Lỗi lấy dữ liệu ${tableName}:`, error);
            res.status(500).json({
                error: "Lỗi server",
                details: error.message,
                hint: "Kiểm tra log server để biết thêm chi tiết"
            });
        }
    });
};

['t4', 't5', 'g1', 'g2', 'g3'].forEach(table => createSensorRoutes(table));

module.exports = router;
