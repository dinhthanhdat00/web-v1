THANH DAT TRADING DASHBOARD

Cong cu web tinh de theo doi BTC swing trading theo da khung thoi gian, tap trung vao price action va bo chi bao RSI14 + EMA9 + WMA45.

Muc tieu:
- Tao mot dashboard gon, nhanh, de nhin.
- Phuc vu viec lap ke hoach giao dich BTC theo H4/H12.
- Tap trung vao BTC, khong lan man sang nhieu cap giao dich.

Tinh nang chinh:
- Chart realtime BTCUSDT lay du lieu tu Binance.
- Chart: xem nhanh H4, H12, D1, D2 theo chart gia.
- Single: mot chart lon co the doi timeframe H1, H4, H12, D1, D2, D3, W.
- RSI Only: so sanh RSI14 + EMA9 + WMA45 tren nhieu khung.
- Baseline nhanh/cham tren chart gia.
- VWAP tuan va VWAP thang.
- Volume.
- Marker P2/P3 theo logic RSI.
- Nen nen xanh/do theo regime RSI.
- Countdown den luc dong nen.
- Dieu chinh chieu cao khung RSI trong Single.
- Ve trendline tren Single chart.
- Crosshair dong bo giua chart gia va RSI.
- Toi uu performance: chi render tab dang xem, giam redraw WebSocket, debounce resize.

Cach dung nhanh:
1. Mo trang web.
2. Nhap symbol, mac dinh la BTCUSDT.
3. Chon Chart, Single hoac RSI Only.
4. Trong Controls, bat/tat cac layer can xem.
5. Trong Single, co the ve trendline va dieu chinh chieu cao RSI.

Khung thoi gian ho tro:
- Single: H1, H4, H12, D1, D2, D3, W.
- Chart va RSI Only: H4, H12, D1, D2.

Cach chay local:
Neu mo truc tiep index.html bi chan ket noi API, chay:

python start_server.py

Sau do mo:

http://localhost:8000

Hoac chay:

start_server.bat

Luu y:
- Day la cong cu ho tro phan tich, khong phai loi khuyen tai chinh.
- Du lieu lay tu Binance, co the cham hoac loi tam thoi tuy ket noi.
- Phuong phap giao dich, file ghi chu rieng va cac reference ca nhan khong nam trong repo nay.

Thuong hieu:
Thanh Dat - hanh trinh trade de tu do tai chinh.
