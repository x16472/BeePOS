from pathlib import Path

import store
import yaml

MENU_PATH = Path(__file__).resolve().parent / "Menu" / "menu.yaml"


def load_menu(path):
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8-sig"))
    if (
        not isinstance(data, dict)
        or data.get("version") != 1
        or not isinstance(data.get("categories"), list)
    ):
        raise ValueError("menu.yaml 必須包含 version: 1 與 categories 清單")
    products = []
    ids = set()
    categories = set()
    for category in data["categories"]:
        if not isinstance(category, dict):
            raise ValueError("菜單分類格式不正確")
        name = store.text(category.get("name"), "分類名稱")
        if name in categories or not isinstance(category.get("products"), list):
            raise ValueError("菜單分類重複或缺少 products 清單")
        categories.add(name)
        for item in category["products"]:
            if not isinstance(item, dict):
                raise ValueError("菜單商品格式不正確")
            key = store.number(item.get("id"), "菜單商品識別碼", 1, 9223372036854775807)
            if key in ids:
                raise ValueError("菜單商品識別碼重複")
            ids.add(key)
            title = store.text(item.get("name"), "商品名稱")
            price = store.number(item.get("price"), "商品價格")
            for field in ("is_active", "is_favorite"):
                if type(item.get(field)) is not bool:
                    raise ValueError(f"{field} 必須為 true 或 false")
            products.append(
                (key, name, title, price, item["is_active"], item["is_favorite"])
            )
    if not products:
        raise ValueError("初始菜單不得為空")
    return products


def initialize_menu(path=None):
    with store.database() as con:
        con.execute("BEGIN IMMEDIATE")
        if con.execute(
            "SELECT 1 FROM initialization_state WHERE name='menu_yaml_v1'"
        ).fetchone():
            return
        rows = load_menu(path or MENU_PATH)
        for key, category, name, price, active, favorite in rows:
            category_row = con.execute(
                "SELECT id FROM categories WHERE name=?", (category,)
            ).fetchone()
            if not category_row:
                category_id = con.execute(
                    "INSERT INTO categories (name) VALUES (?)", (category,)
                ).lastrowid
                store.dirty(con, "categories", category_id)
            else:
                category_id = category_row["id"]
            if con.execute(
                "SELECT 1 FROM products WHERE category_id=? AND name=?",
                (category_id, name),
            ).fetchone():
                continue
            occupied = con.execute("SELECT 1 FROM products WHERE id=?", (key,)).fetchone()
            if occupied:
                product_id = con.execute(
                    "INSERT INTO products (category_id,name,price,is_active,is_favorite,deleted) VALUES (?,?,?,?,?,0)",
                    (category_id, name, price, active, favorite),
                ).lastrowid
            else:
                con.execute(
                    "INSERT INTO products (id,category_id,name,price,is_active,is_favorite,deleted) VALUES (?,?,?,?,?,?,0)",
                    (key, category_id, name, price, active, favorite),
                )
                product_id = key
            store.dirty(con, "products", product_id)
        con.execute(
            "INSERT INTO initialization_state VALUES (?,?)",
            ("menu_yaml_v1", store.now()),
        )
    store.audit("初始化 YAML 菜單", "menu_yaml_v1")
