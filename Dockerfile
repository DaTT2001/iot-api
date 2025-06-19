# Sử dụng Node.js phiên bản LTS
FROM node:18

# Đặt thư mục làm việc
WORKDIR /app

# Copy package.json và package-lock.json trước để cache dependencies
COPY package.json package-lock.json ./

# Cài đặt dependencies
RUN npm install

# Copy toàn bộ code vào container
COPY . .

# Mở cổng API (ví dụ: 5000)
EXPOSE 8080

# Lệnh chạy ứng dụng
CMD ["node", "index.js"]
