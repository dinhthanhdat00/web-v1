# Thành Đạt Trading Dashboard

## Công Nghệ

Project đã được chuyển sang nền **React + Vite** để dễ tách component và mở rộng tính năng trong các bản sau. Engine chart hiện tại vẫn giữ nguyên logic đã kiểm chứng, sau đó sẽ được tách dần thành các component React.

### Phát triển local

```powershell
npm install
npm run dev
```

Mở `http://localhost:5173`.

### Deploy

Mỗi lần push nhánh `main`, GitHub Actions sẽ chạy `npm ci`, build Vite ra `dist` và deploy lên GitHub Pages.

Dashboard web tĩnh hỗ trợ phân tích BTC theo phong cách swing trading đa khung thời gian, tập trung vào price action và bộ chỉ báo RSI14 + EMA9 + WMA45.

> Mục tiêu của dự án là tạo một không gian phân tích gọn, nhanh, dễ nhìn và đủ trực quan để lập kế hoạch giao dịch BTC trên các khung H4/H12.

## Tính Năng Chính

- Theo dõi realtime `BTCUSDT` bằng dữ liệu từ Binance.
- Ba chế độ xem chính:
  - `Chart`: xem nhanh các khung H4, H12, D1, D2 theo chart giá.
  - `Single`: phân tích chi tiết một chart lớn với các khung H1, H4, H12, D1, D2, D3, W.
  - `RSI Only`: so sánh RSI14 + EMA9 + WMA45 trên nhiều khung thời gian.
- Bộ chỉ báo trên chart giá:
  - Baseline nhanh/chậm.
  - VWAP tuần.
  - VWAP tháng.
  - Volume.
- Bộ chỉ báo RSI:
  - RSI14.
  - EMA9 của RSI.
  - WMA45 của RSI.
  - Marker P2/P3 theo logic RSI.
  - Nền xanh/đỏ theo regime RSI.
- Countdown thời gian đóng nến cho từng timeframe.
- Điều chỉnh chiều cao khung RSI trong chế độ `Single`.
- Công cụ vẽ trendline trong chế độ `Single`:
  - Click điểm đầu, đường preview đi theo chuột.
  - Click điểm thứ hai để cố định đường.
  - Chọn và xóa từng trendline.
  - Hỗ trợ Undo và Clear.
- Crosshair đồng bộ giữa chart giá và RSI.
- Tối ưu hiệu năng: chỉ render tab đang xem, giảm redraw từ WebSocket, debounce resize.

## Cách Sử Dụng Nhanh

1. Mở trang web.
2. Nhập symbol cần xem, mặc định là `BTCUSDT`.
3. Chọn chế độ xem:
   - `Chart` để xem tổng quan đa khung.
   - `Single` để phân tích chi tiết một timeframe.
   - `RSI Only` để đọc form RSI.
4. Mở `Controls` để bật/tắt các layer chỉ báo.
5. Trong `Single`, có thể vẽ trendline và điều chỉnh chiều cao khung RSI.

## Khung Thời Gian Hỗ Trợ

Chế độ `Single` hỗ trợ:

- H1
- H4
- H12
- D1
- D2
- D3
- W

Chế độ `Chart` và `RSI Only` hiển thị mặc định:

- H4
- H12
- D1
- D2

## Chạy Local

Nếu mở trực tiếp `index.html` bị trình duyệt chặn kết nối API, hãy chạy server local:

```powershell
python start_server.py
```

Sau đó mở:

```text
http://localhost:8000
```

Hoặc dùng file batch:

```powershell
.\start_server.bat
```

## Lưu Ý

- Đây là công cụ hỗ trợ phân tích, không phải lời khuyên tài chính.
- Dữ liệu lấy từ Binance và có thể bị chậm hoặc lỗi tạm thời tùy kết nối.
- Phương pháp giao dịch, ghi chú riêng và các reference cá nhân không nằm trong repository này.

## Thương Hiệu

**Thành Đạt - Hành trình trade để tự do tài chính.**
