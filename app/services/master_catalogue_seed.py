"""Phase 2C-1A — Master Inventory Catalogue seed (Category → Sub Category → Item).

One centralized catalogue shared by every hospital. The hierarchy is strictly
Category → Sub Category → Item and is never flattened. Existing flat Phase 2B
catalogues are upgraded *in place* (items matched by name and mapped into the
right sub-category, missing items created) so item ids and hospital stock
references are preserved.
"""
import logging
from sqlalchemy import select, func
from app.models.inventory_master import InventoryMaster
from app.models.inventory_category import InventoryCategory

logger = logging.getLogger(__name__)

CATEGORY_CODES = {
    "Diagnosis": "DIA",
    "Surgical": "SUR",
    "Restorative": "RES",
    "Periodontics": "PER",
    "Prosthodontics": "PRO",
    "Endodontics": "END",
    "Cleaning": "CLN",
    "Office Supplies": "OFF",
    "Others": "OTH",
}

# Nested hierarchy: category → (sub_category, sub_code, [(item_name, unit, price ₹)]).
# Sub codes only need to be unique across the whole inventory_categories table.
MASTER_CATALOGUE_HIERARCHY = {
    "Diagnosis": [
        ("Protective Wear", "PRT", [
            ("Gloves", "BOX", 350),
            ("Mouth Masks", "BOX", 250),
        ]),
        ("Diagnostics & Consumables", "DGC", [
            ("Suction Tips", "PACK", 200),
            ("RVG Sleeves", "PACK", 180),
            ("Water Glasses", "PACK", 120),
            ("Mouth Mirrors", "PCS", 90),
        ]),
    ],
    "Surgical": [
        ("Anesthesia", "ANE", [
            ("Local Anesthesia", "VIAL", 180),
        ]),
        ("Instruments", "INS", [
            ("Syringes", "PACK", 150),
            ("BP Blades", "BOX", 220),
            ("Sutures", "PCS", 160),
        ]),
        ("Dressings & Antiseptics", "DRS", [
            ("Cotton", "ROLL", 90),
            ("Gauze", "PACK", 60),
            ("Betadine", "BTL", 140),
            ("Saline", "BTL", 40),
        ]),
    ],
    "Restorative": [
        ("Filling Materials", "FIL", [
            ("GIC", "PCS", 950),
            ("Composite Syringes", "PCS", 1200),
            ("Bonding Agent", "BTL", 1400),
            ("Etchant", "SYR", 600),
        ]),
        ("Accessories", "ACC", [
            ("Applicator Tips", "PACK", 300),
            ("Mixing Pads", "PACK", 150),
            ("Matrix Bands", "PACK", 180),
        ]),
    ],
    "Periodontics": [
        ("Scaling & Instruments", "SCL", [
            ("Scalar Tips", "PCS", 800),
        ]),
        ("Medicaments", "MED", [
            ("Gum Paint", "BTL", 120),
            ("Metrogyl Gel", "TUBE", 85),
        ]),
    ],
    "Prosthodontics": [
        ("Impression Materials", "IMP", [
            ("Alginate", "BAG", 350),
            ("Putty", "TUBE", 900),
            ("Impression Trays", "PCS", 250),
            ("Dental Stone", "BAG", 220),
        ]),
        ("Finishing Materials", "FIN", [
            ("Wax", "ROLL", 120),
        ]),
    ],
    "Endodontics": [
        ("Burs", "BUR", [
            ("EZ Bur", "PCS", 250),
            ("TR62C", "PCS", 250),
        ]),
        ("Hand Files", "HFL", [
            ("Hand Files", "PACK", 700),
        ]),
        ("Rotary Files", "RFL", [
            ("Rotary Files", "BOX", 1800),
            ("Rotary File 17/04", "PCS", 250),
            ("Rotary File 17/06", "PCS", 250),
            ("Rotary File 17/08", "PCS", 250),
            ("Rotary File 23/04", "PCS", 250),
            ("Rotary File 23/06", "PCS", 250),
            ("Rotary File 25/04", "PCS", 250),
            ("Rotary File 25/06", "PCS", 250),
            ("Rotary File 30/04", "PCS", 250),
            ("Rotary File 30/06", "PCS", 250),
        ]),
        ("GG Drills", "GGD", [
            ("GG Drill 1", "PCS", 180),
            ("GG Drill 2", "PCS", 180),
            ("GG Drill 3", "PCS", 180),
            ("GG Drill 4", "PCS", 180),
        ]),
        ("Peso Reamers", "PSR", [
            ("Peso Reamer 15", "PCS", 120),
            ("Peso Reamer 20", "PCS", 120),
            ("Peso Reamer 25", "PCS", 120),
            ("Peso Reamer 30", "PCS", 120),
            ("Peso Reamer 35", "PCS", 120),
            ("Peso Reamer 40", "PCS", 120),
        ]),
        ("Endo Materials", "ENM", [
            ("EDTA", "BTL", 250),
            ("Calplus", "SYR", 400),
            ("Zinc Oxide", "PCS", 150),
            ("Eugenol", "BTL", 120),
        ]),
        ("GP Points", "GPP", [
            ("GP Points", "PACK", 350),
        ]),
    ],
    "Cleaning": [
        ("Disinfectants", "DIS", [
            ("Surface Disinfectant", "BTL", 450),
            ("Dettol", "BTL", 110),
        ]),
        ("General Cleaning", "CLG", [
            ("Glass Cleaner", "BTL", 180),
            ("Floor Cleaner", "BTL", 220),
        ]),
    ],
    "Office Supplies": [
        ("Paper & Printing", "PAP", [
            ("A4 Paper", "REAM", 320),
            ("Printer Toner", "PCS", 1500),
        ]),
        ("Writing & Stationery", "WRT", [
            ("Pens", "BOX", 120),
            ("Stationery Kit", "PACK", 250),
        ]),
    ],
    "Others": [
        ("General", "GEN", []),
    ],
}


async def seed_master_inventory_catalogue():
    from app.database import async_session_factory

    async with async_session_factory() as db:
        await ensure_master_catalogue_hierarchy(db)


async def ensure_master_catalogue_hierarchy(db) -> int:
    """Idempotently ensure the deep Category → Sub Category → Item tree exists.

    Existing items are matched by name (preferring the same root category) and
    mapped into the correct sub-category; only genuinely missing items are
    created. Returns the number of newly created items.
    """
    categories = (await db.execute(select(InventoryCategory))).scalars().all()
    root_by_name = {}
    for c in categories:
        if c.parent_id is None:
            root_by_name.setdefault(c.name.strip().lower(), c)

    items = (await db.execute(select(InventoryMaster))).scalars().all()
    items_by_name = {}
    for it in items:
        items_by_name.setdefault(it.name.strip().lower(), []).append(it)

    total_new = 0
    total_mapped = 0
    for category_name, subs in MASTER_CATALOGUE_HIERARCHY.items():
        root = await _get_or_create_category(db, category_name, CATEGORY_CODES.get(category_name, "GEN"), None)
        root_by_name.setdefault(root.name.strip().lower(), root)
        for sub_name, sub_code, sub_items in subs:
            sub = await _get_or_create_category(db, sub_name, sub_code, root.id)
            for idx, (item_name, unit, price) in enumerate(sub_items, 1):
                matches = items_by_name.get(item_name.strip().lower()) or []
                existing = next((it for it in matches if it.category_id == root.id), None)
                if existing is None and matches:
                    existing = matches[0]
                if existing is None:
                    code = f"{root.code or CATEGORY_CODES.get(category_name, 'GEN')}-{sub_code}-{idx:02d}"
                    db.add(InventoryMaster(
                        name=item_name,
                        code=code,
                        category_id=root.id,
                        sub_category_id=sub.id,
                        unit=unit,
                        purchase_price=price,
                        average_cost=price,
                        status="ACTIVE",
                    ))
                    total_new += 1
                else:
                    if existing.sub_category_id != sub.id or existing.category_id != root.id:
                        existing.sub_category_id = sub.id
                        existing.category_id = root.id
                        total_mapped += 1

    await db.commit()
    logger.info(
        "Master catalogue hierarchy ensured: %s new items, %s items mapped into sub-categories",
        total_new,
        total_mapped,
    )
    return total_new


async def _get_or_create_category(db, name: str, code: str, parent_id):
    query = select(InventoryCategory).where(func.lower(InventoryCategory.name) == name.strip().lower())
    if parent_id is None:
        query = query.where(InventoryCategory.parent_id.is_(None))
    else:
        query = query.where(InventoryCategory.parent_id == parent_id)
    existing = (await db.execute(query)).scalars().first()
    if existing:
        if code and existing.code != code:
            existing.code = code
        return existing
    category = InventoryCategory(
        name=name.strip(),
        code=code,
        parent_id=parent_id,
        is_active=True,
        sort_order=0,
    )
    db.add(category)
    await db.flush()
    return category
