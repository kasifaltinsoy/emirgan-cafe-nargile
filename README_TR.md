# Emirgan Cafe & Nargile

Kaşif ve Ayşe Merve'nin ortak kullanımı için hazırlanmış kişisel sipariş ve hesap takip uygulaması.

## Özellikler

- Ortak kullanıcı adı + şifre ile Firebase Authentication girişi
- Girişten sonra Kaşif / Ayşe Merve seçimi
- Siparişe tek dokunuşla tarih-saat kaydı
- İçecekler, Atıştırmalıklar, Dondurma, Gözleme, Tost, Nargile kategorileri
- Ürün ekleme, fiyat değiştirme, ürünü aktif/pasif yapma
- Nargile çeşitlerini sonradan ekleyebilme
- Ürünün güncel fiyatı değişse bile eski sipariş fiyatının korunması
- Geçmiş sipariş fiyatını gerektiğinde elle düzeltme
- Günlük ve aylık rapor
- Kaşif / Ayşe Merve / ikimiz toplam filtreleri
- PWA: telefonda ana ekrana eklenebilir

## Önemli

`firebase-config.js` dosyasındaki `BURAYA_...` alanları Firebase Console'dan alınan web uygulaması ayarları ile değiştirilmelidir.

Firebase Authentication e-posta/şifre altyapısı kullanır. Uygulama kullanıcı adı alanına örneğin `emirgan` yazıldığında bunu arka planda:

`emirgan@emirgan.local`

adresine çevirir. Firebase Authentication > Users bölümünde aynı e-posta ile tek kullanıcı oluşturun.

## Firestore Rules

`firestore.rules` içeriğini Firebase Console > Firestore Database > Rules bölümüne yapıştırıp Publish düğmesine basın.


## V4
Kategori ikonları, otomatik sık siparişler, kişi bazlı günlük özet, hesabı kapat/ödendi, aylık grafik, en çok tüketilenler, ürün arama, fiyat geçmişi, notlu sipariş, sabit günlük toplam ve koyu mod eklendi.


## V5
Ürün adı düzenleme ve ürün silme eklendi. Ürün silinmesi geçmiş sipariş kayıtlarını etkilemez.
