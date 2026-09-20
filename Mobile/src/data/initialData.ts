import { Product, Order } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  // 便當主食
  { id: 'p1', name: '招牌排骨便當', category: '便當主食', price: 100, is_active: true, is_favorite: true },
  { id: 'p2', name: '香酥大雞腿飯', category: '便當主食', price: 110, is_active: true, is_favorite: true },
  { id: 'p3', name: '古早味控肉飯', category: '便當主食', price: 95, is_active: true, is_favorite: true },
  { id: 'p4', name: '黑胡椒牛柳飯', category: '便當主食', price: 110, is_active: true, is_favorite: false },
  { id: 'p5', name: '香煎鯖魚便當', category: '便當主食', price: 105, is_active: true, is_favorite: false },
  
  // 經典小吃
  { id: 'p6', name: '香菇肉燥乾麵', category: '經典小吃', price: 50, is_active: true, is_favorite: true },
  { id: 'p7', name: '現煮貢丸湯', category: '經典小吃', price: 35, is_active: true, is_favorite: false },
  { id: 'p8', name: '滷香鴨蛋', category: '經典小吃', price: 15, is_active: true, is_favorite: true },
  { id: 'p9', name: '高麗菜時蔬', category: '經典小吃', price: 40, is_active: true, is_favorite: false },
  { id: 'p10', name: '蒜泥白肉切盤', category: '經典小吃', price: 60, is_active: true, is_favorite: false },

  // 冷飲與湯品
  { id: 'p11', name: '古早味決明子紅茶', category: '冷飲湯品', price: 25, is_active: true, is_favorite: true },
  { id: 'p12', name: '高山冷泡青茶', category: '冷飲湯品', price: 35, is_active: true, is_favorite: true },
  { id: 'p13', name: '濃郁鮮奶茶', category: '冷飲湯品', price: 45, is_active: true, is_favorite: false },
  { id: 'p14', name: '養生冬瓜檸檬', category: '冷飲湯品', price: 35, is_active: true, is_favorite: false },
];

export const INITIAL_CATEGORIES = ['全部', '便當主食', '經典小吃', '冷飲湯品', '自訂無碼'];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-101',
    order_no: '#001',
    created_at: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    total_amount: 225,
    received_amount: 500,
    change_amount: 275,
    status: 'completed',
    sync_status: 'synced',
    synced_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    items: [
      { id: 'it-1', order_id: 'ord-101', product_id: 'p1', product_name: '招牌排骨便當', unit_price: 100, quantity: 2, subtotal: 200 },
      { id: 'it-2', order_id: 'ord-101', product_id: 'p11', product_name: '古早味決明子紅茶', unit_price: 25, quantity: 1, subtotal: 25 }
    ]
  },
  {
    id: 'ord-102',
    order_no: '#002',
    created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    total_amount: 145,
    received_amount: 200,
    change_amount: 55,
    status: 'completed',
    sync_status: 'pending',
    items: [
      { id: 'it-3', order_id: 'ord-102', product_id: 'p2', product_name: '香酥大雞腿飯', unit_price: 110, quantity: 1, subtotal: 110 },
      { id: 'it-4', order_id: 'ord-102', product_id: 'p12', product_name: '高山冷泡青茶', unit_price: 35, quantity: 1, subtotal: 35 }
    ]
  },
  {
    id: 'ord-103',
    order_no: '#003',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    total_amount: 190,
    received_amount: 200,
    change_amount: 10,
    status: 'completed',
    sync_status: 'pending',
    items: [
      { id: 'it-5', order_id: 'ord-103', product_id: 'p3', product_name: '古早味控肉飯', unit_price: 95, quantity: 2, subtotal: 190 }
    ]
  }
];
