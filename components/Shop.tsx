import React, { useState, useEffect } from 'react';
import { User, UserShop, ShopItem, ShopOrder } from '../types';
import { useLanguage } from '../LanguageContext';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { db } from '../firebase';

// Backwards compatibility export
export const SHOP_ITEMS: any[] = [];

interface ShopProps {
  currentUser: User;
  onUpdateUser: (updatedData: Partial<User>) => void;
  onNavigateToChat?: (targetUserId: string, initialMessage?: string) => void;
}

export const Shop: React.FC<ShopProps> = ({ currentUser, onUpdateUser, onNavigateToChat }) => {
  const { t } = useLanguage();
  
  // Realtime Data from Firebase
  const [shops, setShops] = useState<UserShop[]>([]);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Active Navigation
  const [activeTab, setActiveTab] = useState<'explore' | 'my_shop' | 'orders'>('explore');
  const [exploreSubTab, setExploreSubTab] = useState<'items' | 'shops'>('items');
  const [selectedShopFilter, setSelectedShopFilter] = useState<UserShop | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Purchase / Chat Modal
  const [selectedItemToBuy, setSelectedItemToBuy] = useState<ShopItem | null>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);

  // Shop Form State
  const [isCreatingShop, setIsCreatingShop] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopDescInput, setShopDescInput] = useState('');
  const [shopBannerInput, setShopBannerInput] = useState('');

  // Item Form State
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemCategory, setItemCategory] = useState('Umum');
  const [itemImage, setItemImage] = useState('');
  const [itemStock, setItemStock] = useState('10');

  // Toast Banner
  const [notificationMsg, setNotificationMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Custom Confirmation Modal Pop-Up State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
  } | null>(null);

  const myShop = shops.find(s => s.ownerId === currentUser.id);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setNotificationMsg({ text, type });
    setTimeout(() => {
      setNotificationMsg(null);
    }, 3500);
  };

  // Helper file uploader
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Ukuran file maksimal 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        callback(reader.result);
        showToast('Gambar berhasil diunggah!');
      }
    };
    reader.readAsDataURL(file);
  };

  // Subscribe to Shops, Items, Orders from Firebase
  useEffect(() => {
    const shopsRef = ref(db, 'shops');
    const itemsRef = ref(db, 'shopItems');
    const ordersRef = ref(db, 'shopOrders');

    const unsubShops = onValue(shopsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: UserShop[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        }));
        setShops(list.sort((a, b) => b.createdAt - a.createdAt));
      } else {
        setShops([]);
      }
    }, (error) => {
      console.warn('Shops listener error:', error);
    });

    const unsubItems = onValue(itemsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: ShopItem[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        }));
        setItems(list.sort((a, b) => b.createdAt - a.createdAt));
      } else {
        setItems([]);
      }
      setLoadingData(false);
    }, (error) => {
      console.warn('Items listener error:', error);
      setLoadingData(false);
    });

    const unsubOrders = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: ShopOrder[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        }));
        setOrders(list.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setOrders([]);
      }
    }, (error) => {
      console.warn('Orders listener error:', error);
    });

    return () => {
      unsubShops();
      unsubItems();
      unsubOrders();
    };
  }, []);

  useEffect(() => {
    if (myShop) {
      setShopNameInput(myShop.shopName || '');
      setShopDescInput(myShop.description || '');
      setShopBannerInput(myShop.bannerURL || '');
    }
  }, [myShop]);

  // Create or Update Shop
  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopNameInput.trim()) {
      showToast('Nama toko tidak boleh kosong.', 'error');
      return;
    }

    // MANDATORY BANNER CHECK
    if (!shopBannerInput.trim()) {
      showToast('Wajib mengunggah file atau mengisikan link banner toko!', 'error');
      return;
    }

    try {
      if (myShop) {
        await update(ref(db, `shops/${myShop.id}`), {
          shopName: shopNameInput.trim(),
          description: shopDescInput.trim(),
          bannerURL: shopBannerInput.trim(),
          ownerName: currentUser.name,
          ownerPhoto: currentUser.photoURL || ''
        });
        showToast('Info Toko berhasil diperbarui!', 'success');
        setIsCreatingShop(false);
      } else {
        const newShopRef = push(ref(db, 'shops'));
        const newShop: UserShop = {
          id: newShopRef.key!,
          ownerId: currentUser.id,
          ownerName: currentUser.name,
          ownerPhoto: currentUser.photoURL || '',
          shopName: shopNameInput.trim(),
          description: shopDescInput.trim() || 'Selamat datang di toko kami!',
          bannerURL: shopBannerInput.trim(),
          createdAt: Date.now()
        };
        await set(newShopRef, newShop);
        showToast(`Toko "${newShop.shopName}" berhasil dibuat!`, 'success');
        setIsCreatingShop(false);
      }
    } catch (err) {
      console.error('Error saving shop:', err);
      showToast('Gagal menyimpan toko. Coba lagi.', 'error');
    }
  };

  // Add or Edit Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myShop) {
      showToast('Anda harus membuat toko terlebih dahulu!', 'error');
      return;
    }

    if (!itemName.trim() || !itemPrice || isNaN(Number(itemPrice))) {
      showToast('Masukkan nama & harga barang (Rp) yang valid.', 'error');
      return;
    }

    // MANDATORY ITEM PHOTO CHECK
    if (!itemImage.trim()) {
      showToast('Wajib mengunggah file atau mengisikan link foto produk!', 'error');
      return;
    }

    const priceNum = Math.max(1, parseInt(itemPrice, 10));
    const stockNum = Math.max(1, parseInt(itemStock || '1', 10));

    try {
      if (editingItemId) {
        await update(ref(db, `shopItems/${editingItemId}`), {
          name: itemName.trim(),
          price: priceNum,
          description: itemDesc.trim(),
          category: itemCategory,
          imageURL: itemImage.trim(),
          stock: stockNum
        });
        showToast('Barang berhasil diperbarui!', 'success');
      } else {
        const newItemRef = push(ref(db, 'shopItems'));
        const newItem: ShopItem = {
          id: newItemRef.key!,
          shopId: myShop.id,
          ownerId: currentUser.id,
          ownerName: myShop.shopName || currentUser.name,
          name: itemName.trim(),
          price: priceNum,
          description: itemDesc.trim() || 'Deskripsi produk.',
          category: itemCategory,
          imageURL: itemImage.trim(),
          stock: stockNum,
          createdAt: Date.now()
        };
        await set(newItemRef, newItem);
        showToast(`Barang "${newItem.name}" berhasil diterbitkan!`, 'success');
      }

      // Reset form
      setItemName('');
      setItemPrice('');
      setItemDesc('');
      setItemCategory('Umum');
      setItemImage('');
      setItemStock('10');
      setIsAddingItem(false);
      setEditingItemId(null);
    } catch (err) {
      console.error('Error saving item:', err);
      showToast('Gagal menyimpan barang.', 'error');
    }
  };

  const handleEditItemClick = (item: ShopItem) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemPrice(item.price.toString());
    setItemDesc(item.description);
    setItemCategory(item.category || 'Umum');
    setItemImage(item.imageURL || '');
    setItemStock((item.stock ?? 10).toString());
    setIsAddingItem(true);
  };

  const handleDeleteItem = (itemId: string, itemNameStr?: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Barang Toko?',
      message: `Apakah Anda yakin ingin menghapus barang ${itemNameStr ? `"${itemNameStr}"` : ''} dari toko Anda?`,
      confirmText: 'Ya, Hapus Barang',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await remove(ref(db, `shopItems/${itemId}`));
          setItems(prev => prev.filter(i => i.id !== itemId));
          showToast('Barang berhasil dihapus.', 'success');
        } catch (err) {
          console.error('Delete item error:', err);
          showToast('Gagal menghapus barang.', 'error');
        }
      }
    });
  };

  const handleDeleteShop = () => {
    if (!myShop) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Toko Permanen?',
      message: `Apakah Anda yakin ingin menghapus toko "${myShop.shopName}" beserta seluruh produk di dalamnya? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus Toko Saya',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          // 1. Delete all items belonging to myShop
          for (const item of myShopItems) {
            await remove(ref(db, `shopItems/${item.id}`));
          }
          // 2. Delete shop record
          await remove(ref(db, `shops/${myShop.id}`));

          // 3. Update local states
          setShops(prev => prev.filter(s => s.id !== myShop.id));
          setItems(prev => prev.filter(i => i.shopId !== myShop.id));
          setIsCreatingShop(false);
          showToast('Toko dan seluruh produk berhasil dihapus.', 'success');
        } catch (err) {
          console.error('Delete shop error:', err);
          showToast('Gagal menghapus toko. Coba lagi.', 'error');
        }
      }
    });
  };

  // Redirect to Chat for Buyer-Seller Conversation ("Obrolan Jual Beli")
  const handleOpenSellerChat = async (item: ShopItem, qty: number = 1) => {
    if (item.ownerId === currentUser.id) {
      showToast('Ini adalah barang dari toko Anda sendiri.', 'error');
      setSelectedItemToBuy(null);
      return;
    }

    const priceRpStr = `Rp ${item.price.toLocaleString('id-ID')}`;
    const totalPriceStr = `Rp ${(item.price * qty).toLocaleString('id-ID')}`;
    const qtyText = qty > 1 ? ` (Jumlah: ${qty} pcs, Total: ${totalPriceStr})` : '';
    const initialMsg = `Halo! Saya tertarik untuk membeli produk "${item.name}" (Harga: ${priceRpStr})${qtyText} dari toko Anda (${item.ownerName}). Apakah produk ini masih tersedia?`;

    // Automatically send initial message to Firebase RTDB so conversation exists in Obrolan Toko
    try {
      const getChatId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');
      const chatId = getChatId(currentUser.id, item.ownerId);
      const msgRef = push(ref(db, `chats/${chatId}/messages`));
      await set(msgRef, {
        senderId: currentUser.id,
        text: initialMsg,
        timestamp: Date.now(),
        isShop: true
      });

      await update(ref(db, `chats/${chatId}`), {
        isShopChat: true,
        lastMessage: initialMsg,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.warn('Auto send shop message error:', err);
    }

    if (onNavigateToChat) {
      onNavigateToChat(item.ownerId, initialMsg);
    } else {
      showToast('Mengarahkan ke obrolan penjual...', 'success');
    }
    setSelectedItemToBuy(null);
  };

  // Filter items for Explore tab
  const filteredItems = items.filter(item => {
    if (selectedShopFilter && item.shopId !== selectedShopFilter.id) return false;
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filter shops for Explore Shops sub-tab
  const filteredShops = shops.filter(shop => {
    const matchesSearch = shop.shopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          shop.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (shop.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const myShopItems = myShop ? items.filter(i => i.shopId === myShop.id) : [];

  const categories = ['all', 'Umum', 'Fashion', 'Digital', 'Aksesoris', 'Kuliner', 'Jasa', 'Elektronik'];

  return (
    <div className="min-h-screen bg-gray-50 pb-24 animate-fade-in">
      {/* Toast Alert */}
      {notificationMsg && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full shadow-2xl border flex items-center space-x-2 text-xs font-bold transition-all animate-bounce ${
          notificationMsg.type === 'success' ? 'bg-black text-white border-yellow-400' : 'bg-red-600 text-white border-red-700'
        }`}>
          <i className={`fas ${notificationMsg.type === 'success' ? 'fa-circle-check text-yellow-400' : 'fa-circle-exclamation'}`}></i>
          <span>{notificationMsg.text}</span>
        </div>
      )}

      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-gray-900 via-black to-gray-800 text-white p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div>
            <div className="flex items-center space-x-2">
              <span className="bg-yellow-400 text-black text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                {t('marketplace_vimos')}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight mt-1 uppercase">{t('shop_and_trade')}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t('shop_tagline')}</p>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex border-b border-white/10 mt-6 space-x-6 text-xs font-bold relative z-10 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('explore')}
            className={`pb-3 shrink-0 transition-all flex items-center space-x-2 relative ${
              activeTab === 'explore' ? 'text-yellow-400 font-extrabold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fas fa-compass"></i>
            <span>{t('explore_market')}</span>
            {activeTab === 'explore' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('my_shop')}
            className={`pb-3 shrink-0 transition-all flex items-center space-x-2 relative ${
              activeTab === 'my_shop' ? 'text-yellow-400 font-extrabold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fas fa-shop"></i>
            <span>{t('my_shop_title')} {myShop ? `(${myShop.shopName})` : ''}</span>
            {activeTab === 'my_shop' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-full"></div>}
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 shrink-0 transition-all flex items-center space-x-2 relative ${
              activeTab === 'orders' ? 'text-yellow-400 font-extrabold' : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fas fa-comments text-yellow-400"></i>
            <span>{t('trade_chat')}</span>
            {activeTab === 'orders' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-full"></div>}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: EXPLORE (BARANG & TOKO) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'explore' && (
        <div className="p-4 space-y-4">
          {/* SUB-TABS: JELAJAHI BARANG vs JELAJAHI TOKO */}
          <div className="bg-white p-1 rounded-2xl border border-gray-200 flex space-x-1 shadow-sm">
            <button
              onClick={() => {
                setExploreSubTab('items');
                setSelectedShopFilter(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 ${
                exploreSubTab === 'items' && !selectedShopFilter
                  ? 'bg-black text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className="fas fa-box-open"></i>
              <span>{t('explore_items')}</span>
            </button>

            <button
              onClick={() => setExploreSubTab('shops')}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 ${
                exploreSubTab === 'shops'
                  ? 'bg-black text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className="fas fa-store"></i>
              <span>{t('explore_shops')} ({shops.length})</span>
            </button>
          </div>

          {/* ACTIVE SHOP FILTER INDICATOR */}
          {selectedShopFilter && (
            <div className="bg-yellow-100 border border-yellow-300 rounded-2xl p-3 flex items-center justify-between text-xs font-bold text-yellow-900">
              <div className="flex items-center space-x-2">
                <i className="fas fa-store"></i>
                <span>Menampilkan barang dari toko: <strong className="underline">{selectedShopFilter.shopName}</strong></span>
              </div>
              <button
                onClick={() => setSelectedShopFilter(null)}
                className="bg-yellow-400 hover:bg-yellow-500 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase"
              >
                Lihat Semua
              </button>
            </div>
          )}

          {/* SEARCH BAR */}
          <div className="relative">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              type="text"
              placeholder={exploreSubTab === 'items' ? t('search_market_placeholder') : t('search_shop_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-2xl text-xs font-medium focus:outline-none focus:border-black shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                <i className="fas fa-times-circle"></i>
              </button>
            )}
          </div>

          {/* EXPLORE SUB-TAB 1: JELAJAHI BARANG */}
          {exploreSubTab === 'items' && (
            <div className="space-y-3">
              {/* CATEGORY FILTERS */}
              <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
                {categories.map(cat => {
                  let catLabel = cat;
                  if (cat === 'all') catLabel = t('all_categories');
                  else if (cat === 'Umum') catLabel = t('cat_umum');
                  else if (cat === 'Fashion') catLabel = t('cat_fashion');
                  else if (cat === 'Digital') catLabel = t('cat_digital');
                  else if (cat === 'Aksesoris') catLabel = t('cat_aksesoris');
                  else if (cat === 'Kuliner') catLabel = t('cat_kuliner');
                  else if (cat === 'Jasa') catLabel = t('cat_jasa');
                  else if (cat === 'Elektronik') catLabel = t('cat_elektronik');

                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all capitalize ${
                        categoryFilter === cat
                          ? 'bg-black text-white shadow-md'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {catLabel}
                    </button>
                  );
                })}
              </div>

              {loadingData ? (
                <div className="py-16 text-center text-gray-400 text-xs font-bold">
                  <i className="fas fa-spinner fa-spin text-xl mb-2 text-black"></i>
                  <p>Memuat daftar barang...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl mx-auto">
                    <i className="fas fa-box-open"></i>
                  </div>
                  <h3 className="font-bold text-sm text-gray-800">Belum ada barang di toko</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    {searchQuery ? 'Tidak ada barang yang cocok dengan kata kunci Anda.' : 'Jadilah penjual pertama yang membuka toko dan memasukkan barang!'}
                  </p>
                  {!myShop && (
                    <button
                      onClick={() => {
                        setActiveTab('my_shop');
                        setIsCreatingShop(true);
                      }}
                      className="bg-black text-white text-xs font-bold px-5 py-2 rounded-full shadow-md hover:bg-gray-800 transition-all"
                    >
                      Buat Toko Saya
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredItems.map(item => {
                    const isMyOwnItem = item.ownerId === currentUser.id;

                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-all group"
                      >
                        <div className="relative aspect-square bg-gray-100 overflow-hidden">
                          <img
                            src={item.imageURL}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.target as HTMLElement).setAttribute('src', 'https://via.placeholder.com/300?text=Foto+Produk');
                            }}
                          />
                          <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-full capitalize">
                            {item.category || 'Umum'}
                          </span>
                          {item.stock <= 0 && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <span className="bg-red-600 text-white font-black text-xs uppercase px-3 py-1 rounded-full">
                                Stok Habis
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                          <div>
                            <div className="flex items-center space-x-1 text-[10px] text-gray-400 font-medium mb-1 truncate">
                              <i className="fas fa-store text-[8px]"></i>
                              <span className="truncate">{item.ownerName}</span>
                            </div>
                            <h3 className="font-extrabold text-xs text-gray-900 line-clamp-1">{item.name}</h3>
                            <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5 leading-tight">
                              {item.description}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                            <div>
                              <span className="text-[9px] text-gray-400 block font-bold">Harga</span>
                              <span className="font-black text-xs text-gray-900">
                                Rp {item.price.toLocaleString('id-ID')}
                              </span>
                            </div>

                            {isMyOwnItem ? (
                              <span className="bg-gray-100 text-gray-600 text-[9px] font-bold px-2.5 py-1 rounded-full border border-gray-200">
                                Barang Anda
                              </span>
                            ) : (
                              <button
                                onClick={() => setSelectedItemToBuy(item)}
                                disabled={item.stock <= 0}
                                className="bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-200 text-black px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm transition-all active:scale-95 flex items-center space-x-1"
                              >
                                <i className="fas fa-comment-dots text-[10px]"></i>
                                <span>Beli</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* EXPLORE SUB-TAB 2: JELAJAHI TOKO */}
          {exploreSubTab === 'shops' && (
            <div className="space-y-3">
              {filteredShops.length === 0 ? (
                <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-2xl mx-auto">
                    <i className="fas fa-store-slash"></i>
                  </div>
                  <h3 className="font-bold text-sm text-gray-800">Belum Ada Toko Terdaftar</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    Jadilah orang pertama yang membuka toko di Vimos!
                  </p>
                  {!myShop && (
                    <button
                      onClick={() => {
                        setActiveTab('my_shop');
                        setIsCreatingShop(true);
                      }}
                      className="bg-black text-white text-xs font-bold px-5 py-2 rounded-full shadow-md hover:bg-gray-800 transition-all"
                    >
                      Buat Toko Sekarang
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredShops.map(shop => {
                    const shopItemCount = items.filter(i => i.shopId === shop.id).length;
                    const isMyOwnShop = shop.ownerId === currentUser.id;

                    return (
                      <div
                        key={shop.id}
                        className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                      >
                        {/* Banner Header */}
                        <div className="h-28 bg-gray-900 relative">
                          <img
                            src={shop.bannerURL}
                            alt={shop.shopName}
                            className="w-full h-full object-cover opacity-80"
                            onError={(e) => {
                              (e.target as HTMLElement).setAttribute('src', 'https://via.placeholder.com/600x200?text=Banner+Toko');
                            }}
                          />
                          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1">
                            <i className="fas fa-box"></i>
                            <span>{shopItemCount} Barang</span>
                          </div>
                        </div>

                        {/* Body Details */}
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="font-black text-base text-gray-900">{shop.shopName}</h3>
                              {isMyOwnShop && (
                                <span className="bg-yellow-400 text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                                  Toko Anda
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {shop.description || 'Tidak ada deskripsi.'}
                            </p>
                            <p className="text-[10px] text-gray-400 font-semibold mt-2 flex items-center space-x-1">
                              <i className="fas fa-user-circle"></i>
                              <span>Pemilik: {shop.ownerName}</span>
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedShopFilter(shop);
                              setExploreSubTab('items');
                            }}
                            className="w-full bg-black text-white hover:bg-gray-800 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 shadow-md active:scale-95"
                          >
                            <i className="fas fa-shop"></i>
                            <span>Lihat Barang Toko ({shopItemCount})</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: MY SHOP MANAGEMENT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'my_shop' && (
        <div className="p-4 space-y-4">
          {!myShop || isCreatingShop ? (
            /* CREATE OR EDIT SHOP FORM */
            <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h2 className="font-black text-base text-gray-900 uppercase">
                    {myShop ? 'Edit Info Toko Anda' : 'Buat Toko Baru Anda'}
                  </h2>
                  <p className="text-xs text-gray-500">Isi nama toko dan unggah gambar banner toko Anda.</p>
                </div>
                {myShop && (
                  <button onClick={() => setIsCreatingShop(false)} className="text-gray-400 hover:text-black">
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveShop} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-gray-600 mb-1">
                    Nama Toko <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Toko Sultan Vimos, Kedai Merch, dll."
                    value={shopNameInput}
                    onChange={(e) => setShopNameInput(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-black focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-gray-600 mb-1">
                    Deskripsi Toko
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Jelaskan produk atau keunggulan toko Anda..."
                    value={shopDescInput}
                    onChange={(e) => setShopDescInput(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-xs font-medium focus:outline-none focus:border-black focus:bg-white resize-none"
                  />
                </div>

                {/* BANNER TOKO (MANDATORY PHOTO: FILE UPLOAD OR LINK) */}
                <div className="p-4 bg-yellow-50/60 border border-yellow-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase text-gray-900 flex items-center space-x-1">
                      <i className="fas fa-image text-yellow-600"></i>
                      <span>Banner Toko (Wajib) <span className="text-red-500">*</span></span>
                    </label>
                    <span className="text-[10px] text-gray-500 font-bold">Upload / Link URL</span>
                  </div>

                  {/* Preview Banner */}
                  {shopBannerInput && (
                    <div className="h-28 rounded-xl overflow-hidden bg-gray-100 border border-gray-300 relative group">
                      <img src={shopBannerInput} alt="Banner Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setShopBannerInput('')}
                        className="absolute top-2 right-2 bg-black/70 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      >
                        <i className="fas fa-trash-can"></i>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* File Upload Button */}
                    <div>
                      <label className="w-full border-2 border-dashed border-gray-300 bg-white hover:border-black rounded-xl p-2.5 flex items-center justify-center space-x-2 cursor-pointer transition-all text-xs font-bold text-gray-700">
                        <i className="fas fa-cloud-arrow-up text-yellow-500"></i>
                        <span>Upload File Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, (url) => setShopBannerInput(url))}
                        />
                      </label>
                    </div>

                    {/* Or URL Input */}
                    <div>
                      <input
                        type="url"
                        placeholder="Atau Tempel Link URL Gambar..."
                        value={shopBannerInput}
                        onChange={(e) => setShopBannerInput(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  {myShop && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingShop(false)}
                      className="flex-1 py-3 rounded-xl border border-gray-300 text-xs font-bold hover:bg-gray-50"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 bg-black text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:bg-gray-800 transition-all active:scale-95"
                  >
                    {myShop ? 'Simpan Perubahan Toko' : 'Buat Toko Sekarang'}
                  </button>
                </div>

                {myShop && (
                  <div className="pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleDeleteShop}
                      className="w-full py-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-extrabold text-xs transition-colors flex items-center justify-center space-x-2"
                    >
                      <i className="fas fa-trash-can text-xs"></i>
                      <span>Hapus Toko Saya Permanen</span>
                    </button>
                  </div>
                )}
              </form>
            </div>
          ) : (
            /* USER HAS A SHOP -> SHOW DASHBOARD */
            <div className="space-y-4">
              {/* SHOP BANNER CARD */}
              <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="h-32 bg-gray-900 relative">
                  <img
                    src={myShop.bannerURL}
                    alt={myShop.shopName}
                    className="w-full h-full object-cover opacity-85"
                  />
                  <div className="absolute top-3 right-3 flex items-center space-x-2">
                    <button
                      onClick={() => setIsCreatingShop(true)}
                      className="bg-black/80 hover:bg-black text-white text-[10px] font-extrabold px-3 py-1.5 rounded-full backdrop-blur-md transition-all flex items-center space-x-1"
                    >
                      <i className="fas fa-edit"></i>
                      <span>Edit Toko</span>
                    </button>
                    <button
                      onClick={handleDeleteShop}
                      className="bg-red-600/90 hover:bg-red-600 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-full backdrop-blur-md transition-all flex items-center space-x-1 shadow-md"
                      title="Hapus Toko Anda"
                    >
                      <i className="fas fa-trash-can"></i>
                      <span>Hapus Toko</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 flex items-center justify-between border-b border-gray-100">
                  <div>
                    <h2 className="font-black text-lg text-gray-900 flex items-center space-x-2">
                      <span>{myShop.shopName}</span>
                      <i className="fas fa-circle-check text-blue-500 text-xs"></i>
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">{myShop.description}</p>
                  </div>

                  <button
                    onClick={() => {
                      setEditingItemId(null);
                      setItemName('');
                      setItemPrice('');
                      setItemDesc('');
                      setItemCategory('Umum');
                      setItemImage('');
                      setItemStock('10');
                      setIsAddingItem(true);
                    }}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black px-4 py-2.5 rounded-full uppercase shadow-md transition-all active:scale-95 flex items-center space-x-1.5 shrink-0"
                  >
                    <i className="fas fa-plus"></i>
                    <span>Tambah Barang</span>
                  </button>
                </div>
              </div>

              {/* FORM ADD/EDIT ITEM */}
              {isAddingItem && (
                <div className="bg-white rounded-3xl border-2 border-black p-5 shadow-lg space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <h3 className="font-black text-sm uppercase text-gray-900">
                      {editingItemId ? 'Edit Barang Toko' : 'Tambah Barang Baru'}
                    </h3>
                    <button onClick={() => setIsAddingItem(false)} className="text-gray-400 hover:text-black">
                      <i className="fas fa-times"></i>
                    </button>
                  </div>

                  <form onSubmit={handleSaveItem} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-gray-600 mb-1">
                          Nama Barang <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Misal: Sepatu Sneaker, Kaos VIP, dll."
                          value={itemName}
                          onChange={(e) => setItemName(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-gray-600 mb-1">
                          Harga Barang (Rp) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="Misal: 50000"
                          value={itemPrice}
                          onChange={(e) => setItemPrice(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:border-black"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-gray-600 mb-1">
                          Kategori
                        </label>
                        <select
                          value={itemCategory}
                          onChange={(e) => setItemCategory(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:border-black"
                        >
                          {categories.filter(c => c !== 'all').map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-gray-600 mb-1">
                          Jumlah Stok
                        </label>
                        <input
                          type="number"
                          min="1"
                          placeholder="10"
                          value={itemStock}
                          onChange={(e) => setItemStock(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:border-black"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold uppercase text-gray-600 mb-1">
                        Deskripsi Barang
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Detail spesifikasi produk..."
                        value={itemDesc}
                        onChange={(e) => setItemDesc(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-black resize-none"
                      />
                    </div>

                    {/* PRODUCT PHOTO (MANDATORY PHOTO: UPLOAD FILE OR LINK) */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase text-gray-900 flex items-center space-x-1">
                          <i className="fas fa-camera text-yellow-600"></i>
                          <span>Foto Produk (Wajib) <span className="text-red-500">*</span></span>
                        </label>
                      </div>

                      {itemImage && (
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-white border border-gray-300 relative">
                          <img src={itemImage} alt="Product Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setItemImage('')}
                            className="absolute top-1 right-1 bg-black/80 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="w-full border border-dashed border-gray-300 bg-white hover:border-black rounded-xl p-2 flex items-center justify-center space-x-1.5 cursor-pointer text-xs font-bold text-gray-700">
                          <i className="fas fa-upload text-yellow-500"></i>
                          <span>Upload Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e, (url) => setItemImage(url))}
                          />
                        </label>

                        <input
                          type="url"
                          placeholder="Atau Tempel Link URL..."
                          value={itemImage}
                          onChange={(e) => setItemImage(e.target.value)}
                          className="w-full bg-white border border-gray-300 rounded-xl p-2 text-xs font-medium focus:outline-none focus:border-black"
                        />
                      </div>
                    </div>

                    <div className="flex space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingItem(false)}
                        className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold hover:bg-gray-100"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-black text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:bg-gray-800 transition-all"
                      >
                        {editingItemId ? 'Simpan Edit' : 'Terbitkan Barang'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* LIST OF ITEMS IN MY SHOP */}
              <div>
                <h3 className="font-black text-xs uppercase text-gray-500 mb-3 tracking-wider">
                  Daftar Barang Toko Anda ({myShopItems.length})
                </h3>

                {myShopItems.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                    <p className="text-xs text-gray-400 font-bold">Toko Anda belum memiliki barang yang dijual.</p>
                    <button
                      onClick={() => setIsAddingItem(true)}
                      className="mt-3 bg-black text-white text-xs font-bold px-4 py-2 rounded-full shadow-md hover:bg-gray-800 transition-all"
                    >
                      + Tambah Barang Pertama
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myShopItems.map(item => (
                      <div
                        key={item.id}
                        className="bg-white border border-gray-200 rounded-2xl p-3 flex items-center justify-between shadow-sm"
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={item.imageURL}
                            alt={item.name}
                            className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0"
                          />
                          <div>
                            <h4 className="font-bold text-xs text-gray-900">{item.name}</h4>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span className="text-[10px] text-gray-900 font-black">
                                Rp {item.price.toLocaleString('id-ID')}
                              </span>
                              <span className="text-[10px] text-gray-400">• Stok: {item.stock}</span>
                              <span className="text-[9px] bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-full capitalize">
                                {item.category}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleEditItemClick(item)}
                            className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 hover:bg-black hover:text-white flex items-center justify-center text-xs transition-all"
                            title="Edit"
                          >
                            <i className="fas fa-pencil"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white flex items-center justify-center text-xs transition-all"
                            title="Hapus"
                          >
                            <i className="fas fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: OBROLAN JUAL BELI & PETUNJUK TRANSAKSI */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'orders' && (
        <div className="p-4 space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-yellow-400 text-black flex items-center justify-center text-lg font-black shrink-0 shadow-md">
                <i className="fas fa-comments"></i>
              </div>
              <div>
                <h2 className="font-black text-sm text-gray-900 uppercase">Sistem Obrolan Jual Beli Direct</h2>
                <p className="text-xs text-gray-500 mt-0.5">Transaksi dilakukan secara pribadi langsung antara penjual dan pembeli.</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs space-y-2 text-gray-700">
              <h3 className="font-extrabold text-gray-900 flex items-center space-x-1.5">
                <i className="fas fa-circle-info text-yellow-600"></i>
                <span>Cara Bertransaksi di Marketplace Vimos:</span>
              </h3>
              <ol className="list-decimal list-inside space-y-1 font-medium pl-1 text-[11px]">
                <li>Pilih barang yang Anda minati di tab <strong>Jelajahi Pasar</strong>.</li>
                <li>Klik tombol <strong>Beli / Chat Penjual</strong> pada barang tersebut.</li>
                <li>Sistem akan otomatis mengarahkan Anda ke <strong>Obrolan Pesan (Chat)</strong> dengan Penjual disertai draf pesan produk.</li>
                <li>Sepakati harga, metode pembayaran (transfer/COD/e-wallet), dan alamat pengiriman secara langsung dengan Penjual.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL ITEM & BUY VIA CHAT MODAL */}
      {selectedItemToBuy && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 text-center relative overflow-hidden">
            <button
              onClick={() => setSelectedItemToBuy(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs hover:bg-gray-200 transition-all"
            >
              <i className="fas fa-xmark"></i>
            </button>

            <span className="bg-yellow-100 text-yellow-800 text-[9px] font-black uppercase px-3 py-1 rounded-full">
              Detail Barang & Jual Beli
            </span>

            <div className="my-4 flex items-center justify-center">
              <img
                src={selectedItemToBuy.imageURL}
                alt={selectedItemToBuy.name}
                className="w-24 h-24 rounded-2xl object-cover bg-gray-100 border border-gray-200 shadow-sm"
              />
            </div>

            <h3 className="font-black text-base text-gray-900">{selectedItemToBuy.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{selectedItemToBuy.description}</p>

            <div className="bg-gray-50 rounded-2xl p-3.5 my-4 space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Toko Penjual:</span>
                <span className="font-bold text-gray-900">{selectedItemToBuy.ownerName}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Harga per unit:</span>
                <span className="font-black text-gray-900">Rp {selectedItemToBuy.price.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600 pt-1 border-t border-gray-200">
                <span>Jumlah yang diinginkan:</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setBuyQuantity(Math.max(1, buyQuantity - 1))}
                    className="w-6 h-6 rounded-full bg-gray-200 font-bold flex items-center justify-center text-xs hover:bg-gray-300"
                  >
                    -
                  </button>
                  <span className="font-bold text-gray-900 px-1">{buyQuantity}</span>
                  <button
                    onClick={() => setBuyQuantity(Math.min(selectedItemToBuy.stock, buyQuantity + 1))}
                    className="w-6 h-6 rounded-full bg-gray-200 font-bold flex items-center justify-center text-xs hover:bg-gray-300"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-200 flex justify-between font-black text-gray-900 text-sm">
                <span>Total Biaya:</span>
                <span className="text-black">
                  Rp {(selectedItemToBuy.price * buyQuantity).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedItemToBuy(null)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => handleOpenSellerChat(selectedItemToBuy, buyQuantity)}
                className="flex-1 py-2.5 rounded-full bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-black shadow-md transition-all active:scale-95 flex items-center justify-center space-x-1.5"
              >
                <i className="fas fa-comment-dots text-xs"></i>
                <span>Chat Penjual untuk Beli</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* CUSTOM CONFIRMATION MODAL POP-UP */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 text-center space-y-4 animate-scale-up">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner">
              <i className="fas fa-trash-can"></i>
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-gray-900">{confirmModal.title}</h3>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-2xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all active:scale-95"
              >
                {confirmModal.confirmText || 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shop;
