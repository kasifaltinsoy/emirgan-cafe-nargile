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


## V6
Fiyat Geçmişi bölümüne 'Geçmişi Sıfırla' butonu eklendi. Bu işlem yalnızca fiyat geçmişi kayıtlarını siler; mevcut ürün fiyatlarını ve geçmiş siparişleri etkilemez.


## V7
- Sipariş düzenleme
- Gün sonu özeti
- Ödenen/açık gün listesi
- Aylık açık bakiye
- Tarih aralığı raporu
- CSV/Excel dışa aktarım
- JSON veri yedeği
- Hızlı tekrar
- Sabit favoriler
- Yeni sürüm bildirimi
- Bugün/seçilen gün kayıtlarını sıfırlama
- Tek dokunuşla Kaşif/Ayşe Merve geçişi
- Uygulama içi sürüm numarası


## V8
Ürün adı değiştirildiğinde aynı productId ile bağlı tüm geçmiş siparişlerde ve fiyat geçmişinde ürün adı da otomatik güncellenir.


## V9
- Aylık hesap dönemi: her ay 20'sinde başlar, sonraki ayın 18'inde biter; 19'u ödeme günü.
- Günlük ödeme/hesap kapatma mantığı kaldırıldı.
- Gelişmiş istatistikler eklendi.
- Fiyat artış analizi eklendi.
- Siparişler silindiğinde Çöp Kutusuna taşınır; geri yüklenebilir.
- Ayrı Sık Kullanılanlar sekmesi eklendi; Ayarlar'dan yıldızlanan ürünler burada görünür.
- Yeni Emirgan görsel kimliği ve logo eklendi.


## V10
Sık Kullanılanlar artık doğrudan kendi sekmesinden yönetilir. + Ürün Ekle ile ürün seçilebilir, aynı ekrandan favoriden çıkarılabilir. Ayarlar bölümündeki favori yönetimi kaldırıldı.
