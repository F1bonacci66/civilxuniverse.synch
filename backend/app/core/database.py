"""
Настройка подключения к базе данных
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings
import os

# Определяем DATABASE_URL - используем SQLite если PostgreSQL недоступен
database_url = settings.DATABASE_URL

# Если DATABASE_URL указывает на PostgreSQL, но он недоступен, используем SQLite
if database_url.startswith("postgresql://"):
    try:
        # Пробуем подключиться к PostgreSQL
        test_engine = create_engine(database_url, poolclass=NullPool, connect_args={"connect_timeout": 2})
        test_engine.connect()
        test_engine.dispose()
    except Exception:
        # Если PostgreSQL недоступен, переключаемся на SQLite
        print("⚠️  PostgreSQL недоступен, используем SQLite для разработки")
        # Создаем путь к базе данных в корне backend/
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        db_dir = os.path.join(backend_dir, "data")
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, "civilx_universe.db")
        database_url = f"sqlite:///{db_path}"
        print(f"📁 SQLite база данных: {db_path}")

# Создаем engine
engine = create_engine(
    database_url,
    poolclass=NullPool,  # Используем NullPool для упрощения
    echo=False,  # Установите в True для отладки SQL запросов
    connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {}
)

# Создаем сессию
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый класс для моделей
Base = declarative_base()


async def init_db():
    """Инициализация базы данных"""
    # Импортируем все модели для их регистрации в Base.metadata
    from app.models import universe_user  # noqa: F401
    from app.models import project  # noqa: F401
    from app.models import upload  # noqa: F401
    from app.models import pivot  # noqa: F401
    
    # Создаем таблицы, если используем SQLite или если нужно
    # Для PostgreSQL таблицы создаются вручную через миграции
    try:
        print("📦 Проверяем наличие таблиц в текущей БД...")
        Base.metadata.create_all(bind=engine)
        print("✅ Таблицы готовы")
    except Exception as e:
        print(f"❌ Не удалось создать таблицы автоматически: {e}")
        raise


def get_db():
    """Dependency для получения сессии БД"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

