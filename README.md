# Thanh Dat Trading Dashboard

Cong cu web tinh de theo doi BTC swing trading theo da khung thoi gian, tap trung vao price action va bo chi bao RSI14 + EMA9 + WMA45.

> Muc tieu cua du an: tao mot dashboard gon, nhanh, de nhin, phuc vu viec lap ke hoach giao dich BTC theo H4/H12.

## Tinh nang chinh

- Chart realtime BTCUSDT lay du lieu tu Binance.
- Cac che do xem:
  - `Chart`: nhin nhanh H4, H12, D1, D2 theo chart gia.
  - `Single`: mot chart lon co the doi timeframe H1, H4, H12, D1, D2, D3, W.
  - `RSI Only`: so sanh RSI14 + EMA9 + WMA45 tren nhieu khung.
- Bo chi bao tren chart gia:
  - Baseline nhanh/cham.
  - VWAP tuan.
  - VWAP thang.
  - Volume.
- Bo chi bao RSI:
  - RSI14.
  - EMA9 cua RSI.
  - WMA45 cua RSI.
  - Marker P2/P3 theo logic RSI.
  - Nen nen xanh/do theo regime.
- Countdown den luc dong nen cho tung timeframe.
- Dieu chinh chieu cao khung RSI trong `Single`.
- Ve trendline tren chart `Single`:
  - Click diem dau, duong preview di theo chuot.
  - Click diem thu hai de co dinh.
  - Chon/xoa tung trendline.
  - Undo va Clear.
- Crosshair dong bo giua chart gia va RSI trong `Single`.
- Toi uu performance: chi render tab dang xem, giam redraw WebSocket, debounce resize.

## Cach dung nhanh

1. Mo trang web.
2. Nhap symbol, mac dinh la `BTCUSDT`.
3. Chon che do xem:
   - `Chart` de xem tong quan da khung.
   - `Single` de phan tich chi tiet mot timeframe.
   - `RSI Only` de doc form RSI.
4. Trong `Controls`, bat/tat cac layer can xem.
5. Khi dung `Single`, co the ve trendline va dieu chinh khung RSI.

## Khung thoi gian ho tro

`Single` ho tro:

- H1
- H4
- H12
- D1
- D2
- D3
- W

`Chart` va `RSI Only` hien mac dinh:

- H4
- H12
- D1
- D2

## Cach chay local

Neu mo truc tiep `index.html` bi chan ket noi API, chay server local:

```powershell
python start_server.py
```

Sau do mo:

```text
http://localhost:8000
```

Hoac dung:

```powershell
.\start_server.bat
```

## Luu y

- Day la cong cu ho tro phan tich, khong phai loi khuyen tai chinh.
- Du lieu lay tu Binance, co the cham hoac loi tam thoi tuy ket noi.
- Phuong phap giao dich, file ghi chu rieng va cac reference ca nhan khong nam trong repo nay.

## Thuong hieu

Thanh Dat - hanh trinh trade de tu do tai chinh.
