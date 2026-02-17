"""
API эндпоинты для ИИ-классификации элементов по СВОР
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, UploadFile, File, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Dict, Any
from uuid import UUID
import uuid
import logging
import csv
import io
from pathlib import Path

from app.core.database import get_db
from app.core.universe_auth import get_current_user
from app.models.universe_user import UniverseUser
from app.models.ai_classification import (
    SVORDocument,
    SVORPosition,
    SVORFilter,
    SVOREmbedding,
    ElementEmbedding,
    ClassificationResult,
    ClassificationTrainingEvent,
    ClassificationSettings,
)
from app.models.upload import CSVDataRow, FileUpload
from app.schemas.ai_classification import (
    ElementUploadRequest,
    SVORUploadRequest,
    SVORPositionCreate,
    SVORPositionResponse,
    ClassificationRunRequest,
    ClassificationRunResponse,
    ClassificationResultsResponse,
    ElementClassificationResult,
    ClassificationProposal,
    ClassificationConfirmRequest,
    ClassificationChangeRequest,
    ClassificationRejectRequest,
    ClassificationActionResponse,
    TrainingEventResponse,
    ClassificationSettingsRequest,
    ClassificationSettingsResponse,
)
from app.services.classification_service import (
    build_svor_embedding_text,
    get_or_create_undefined_svor_position,
)
from app.services.embedding_service import create_embeddings_batch

router = APIRouter()
logger = logging.getLogger(__name__)


# ==================== Вспомогательные функции для работы с CSV ====================

def read_csv_file_from_upload(file: UploadFile) -> List[Dict[str, Any]]:
    """
    Читает CSV файл из загруженного файла и возвращает список словарей
    
    Args:
        file: Загруженный файл
        
    Returns:
        Список словарей с данными из CSV
    """
    rows = []
    encodings = ["utf-8", "utf-8-sig", "cp1251", "windows-1251", "latin-1"]
    
    # Читаем содержимое файла
    content = file.file.read()
    
    for encoding in encodings:
        try:
            # Декодируем содержимое
            text = content.decode(encoding)
            
            # Определяем разделитель
            sample = text[:1024] if len(text) > 1024 else text
            delimiter = "," if "," in sample else ";"
            
            # Читаем CSV
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            for row in reader:
                rows.append(row)
            
            logger.info(f"CSV прочитан: {len(rows)} строк (кодировка: {encoding})")
            return rows
        except (UnicodeDecodeError, UnicodeError) as e:
            logger.warning(f"Кодировка {encoding} не подошла: {e}")
            rows = []
            continue
        except Exception as e:
            logger.error(f"Ошибка при чтении с кодировкой {encoding}: {e}")
            rows = []
            continue
    
    # Если все кодировки не подошли, пробуем с errors='ignore'
    logger.warning("Пробуем чтение с игнорированием ошибок кодировки...")
    try:
        text = content.decode("utf-8", errors="ignore")
        sample = text[:1024] if len(text) > 1024 else text
        delimiter = "," if "," in sample else ";"
        
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        for row in reader:
            rows.append(row)
        
        logger.info(f"CSV прочитан: {len(rows)} строк (с игнорированием ошибок)")
        return rows
    except Exception as e:
        logger.error(f"Ошибка при чтении CSV: {e}")
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать CSV файл: {str(e)}")


# ==================== Эндпоинты для загрузки элементов ====================

@router.post("/elements/upload")
async def upload_elements(
    request: ElementUploadRequest,
    db: Session = Depends(get_db),
):
    """
    Загрузить элементы для классификации
    
    В MVP: просто сохраняем информацию о том, что элементы готовы к классификации.
    Реальная обработка происходит при запуске классификации.
    """
    # TODO: В будущем здесь можно сохранять элементы в промежуточную таблицу
    # Пока просто проверяем, что проект и версия существуют
    from app.models.project import Project, ProjectVersion
    
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    
    version = db.query(ProjectVersion).filter(
        and_(
            ProjectVersion.id == request.version_id,
            ProjectVersion.project_id == request.project_id
        )
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Версия проекта не найдена")
    
    return {
        "success": True,
        "message": f"Получено {len(request.elements)} элементов для классификации",
        "project_id": str(request.project_id),
        "version_id": str(request.version_id),
    }


# ==================== Эндпоинты для загрузки СВОР ====================

@router.post("/svor/upload")
async def upload_svor(
    request: SVORUploadRequest,
    db: Session = Depends(get_db),
    current_user: UniverseUser = Depends(get_current_user),
):
    """
    Загрузить позиции СВОР
    
    Создает позиции СВОР с фильтрами и embedding текстом.
    Использует батч-обработку для создания embedding векторов (быстрее).
    """
    import time
    
    # Логируем сразу при получении запроса
    logger.info("=" * 60)
    logger.info(f"[SVOR Upload] ✅ Запрос получен")
    logger.info(f"[SVOR Upload] document_name: {request.document_name}")
    logger.info(f"[SVOR Upload] positions count: {len(request.positions) if request.positions else 0}")
    if request.positions and len(request.positions) > 0:
        logger.info(f"[SVOR Upload] First position: code={request.positions[0].svor_code}, name={request.positions[0].svor_name}")
        # Логируем структуру первой позиции для отладки
        first_pos = request.positions[0]
        logger.info(f"[SVOR Upload] First position details: svor_code={first_pos.svor_code}, svor_name={first_pos.svor_name}, svor_description={first_pos.svor_description}, filters={first_pos.filters}, embedding_text={first_pos.embedding_text}")
    logger.info(f"[SVOR Upload] Начало обработки...")
    
    start_time = time.time()
    logger.info(f"[SVOR Upload] Начало загрузки СВОР: {len(request.positions)} позиций")
    logger.info(f"[SVOR Upload] Пользователь: {current_user.email} (ID: {current_user.id})")
    logger.info(f"[SVOR Upload] Название документа: {request.document_name}")
    
    created_positions = []
    embedding_model_name = "all-MiniLM-L6-v2"  # Используем бесплатную модель по умолчанию
    
    # Шаг 1: Создаем документ СВОР
    step1_start = time.time()
    logger.info(f"[SVOR Upload] Шаг 1: Создание документа СВОР...")
    
    svor_document = SVORDocument(
        name=request.document_name,
        user_id=current_user.id,
    )
    db.add(svor_document)
    db.flush()
    db.commit()
    step1_duration = time.time() - step1_start
    logger.info(f"[SVOR Upload] ✅ Создан документ СВОР: {svor_document.name} (ID: {svor_document.id})")
    
    # Проверяем на дубликаты кодов в запросе
    codes_in_request = [p.svor_code for p in request.positions]
    unique_codes = set(codes_in_request)
    if len(codes_in_request) != len(unique_codes):
        duplicate_codes = [code for code in unique_codes if codes_in_request.count(code) > 1]
        logger.warning(f"[SVOR Upload] ⚠️ Обнаружены дубликаты кодов в запросе: {duplicate_codes}")
        for dup_code in duplicate_codes:
            count = codes_in_request.count(dup_code)
            logger.warning(f"[SVOR Upload]   Код '{dup_code}' встречается {count} раз(а)")
    
    # Шаг 2: Создаем позиции и собираем тексты для embedding
    step2_start = time.time()
    logger.info(f"[SVOR Upload] Шаг 2: Создание позиций...")
    
    positions_list = []
    embedding_texts = []
    position_to_text_index = {}  # Маппинг position -> index в embedding_texts
    
    for idx, position_data in enumerate(request.positions, 1):
        # Логируем каждую позицию для диагностики
        logger.info(f"[SVOR Upload] Обработка позиции {idx}/{len(request.positions)}: код={position_data.svor_code}, название={position_data.svor_name}")
        
        try:
            # Создаем новую позицию
            logger.info(f"[SVOR Upload] Создание новой позиции: код={position_data.svor_code}, название={position_data.svor_name}")
            position = SVORPosition(
                svor_document_id=svor_document.id,
                svor_code=position_data.svor_code,
                svor_name=position_data.svor_name,
                svor_description=position_data.svor_description,
            )
            db.add(position)
            db.flush()
            logger.info(f"[SVOR Upload] Новая позиция создана: ID={str(position.id)}, код={position.svor_code}")
        except Exception as e:
            logger.error(f"[SVOR Upload] Ошибка при обработке позиции {position_data.svor_code}: {e}")
            db.rollback()
            raise
        
        positions_list.append((position, position_data))
        
        # Создаем текст для embedding
        embedding_text = build_svor_embedding_text(
            position.svor_code,
            position.svor_name,
            position.svor_description
        )
        embedding_texts.append(embedding_text)
        position_to_text_index[str(position.id)] = len(embedding_texts) - 1
        
        # Создаем или обновляем фильтры
        if position_data.filters:
            existing_filter = db.query(SVORFilter).filter(
                SVORFilter.svor_position_id == position.id
            ).first()
            
            if existing_filter:
                # Обновляем существующий фильтр
                for key, value in position_data.filters.dict(exclude_none=True).items():
                    setattr(existing_filter, key, value)
            else:
                # Создаем новый фильтр
                filter_data = position_data.filters.dict(exclude_none=True)
                svor_filter = SVORFilter(
                    svor_position_id=position.id,
                    **filter_data
                )
                db.add(svor_filter)
    
    # Коммитим все позиции и фильтры
    db.commit()
    step2_duration = time.time() - step2_start
    logger.info(f"[SVOR Upload] ✅ Шаг 2 завершен за {step2_duration:.2f} сек")
    logger.info(f"[SVOR Upload] Создано позиций: {len(positions_list)}")
    
    # Шаг 3: Создаем embedding векторы батчем (быстрее чем по одному)
    step3_start = time.time()
    logger.info(f"[SVOR Upload] Шаг 3: Создание embedding векторов для {len(embedding_texts)} позиций (батч-обработка)...")
    logger.info(f"[SVOR Upload] Модель: {embedding_model_name}")
    try:
        embedding_vectors = create_embeddings_batch(embedding_texts, embedding_model_name)
        step3_duration = time.time() - step3_start
        logger.info(f"[SVOR Upload] ✅ Шаг 3 завершен за {step3_duration:.2f} сек")
        logger.info(f"[SVOR Upload] Создано embedding векторов: {len(embedding_vectors)}")
    except Exception as e:
        step3_duration = time.time() - step3_start
        logger.error(f"[SVOR Upload] ❌ Ошибка создания embedding векторов за {step3_duration:.2f} сек: {e}")
        logger.error(f"[SVOR Upload] Traceback:", exc_info=True)
        # ВАЖНО: Если не удалось создать embedding, сохраняем позиции БЕЗ embedding
        # Embedding можно будет создать позже при запуске классификации
        logger.warning(f"[SVOR Upload] ⚠️ Сохраняем позиции БЕЗ embedding векторов (можно создать позже)")
        embedding_vectors = []  # Пустой список - embedding не созданы
    
    # Шаг 4: Сохраняем embedding для каждой позиции (если они были созданы)
    step4_start = time.time()
    if embedding_vectors and len(embedding_vectors) == len(positions_list):
        logger.info(f"[SVOR Upload] Шаг 4: Сохранение embedding для {len(positions_list)} позиций...")
        for position, position_data in positions_list:
            # Используем str(position.id) для получения embedding
            position_id_key = str(position.id)
            text_index = position_to_text_index.get(position_id_key)
            if text_index is None:
                logger.warning(f"[SVOR Upload] Не найден индекс для позиции {position_id_key}, пропускаем embedding")
                continue
            embedding_vector = embedding_vectors[text_index]
            embedding_text = embedding_texts[text_index]
            
            # Сохраняем или обновляем embedding
            existing_embedding = db.query(SVOREmbedding).filter(
                and_(
                    SVOREmbedding.svor_position_id == position.id,
                    SVOREmbedding.model_name == embedding_model_name
                )
            ).first()
            
            if existing_embedding:
                existing_embedding.embedding_vector = embedding_vector
                existing_embedding.embedding_text = embedding_text
                # Коммитим обновление сразу
                try:
                    db.commit()
                except Exception as e:
                    logger.error(f"[SVOR Upload] ❌ Ошибка при коммите обновления embedding для {position_id_key}: {e}")
                    db.rollback()
                    raise
            else:
                svor_embedding = SVOREmbedding(
                    svor_position_id=position.id,
                    embedding_vector=embedding_vector,
                    embedding_text=embedding_text,
                    model_name=embedding_model_name,
                )
                db.add(svor_embedding)
                # Коммитим каждое embedding отдельно, чтобы избежать batch insert
                try:
                    db.commit()
                except Exception as e:
                    logger.error(f"[SVOR Upload] ❌ Ошибка при коммите embedding для {position_id_key}: {e}")
                    db.rollback()
                    raise
        
        step4_duration = time.time() - step4_start
        logger.info(f"[SVOR Upload] ✅ Шаг 4 завершен за {step4_duration:.2f} сек")
    else:
        logger.warning(f"[SVOR Upload] Шаг 4: Embedding векторы не созданы, пропускаем сохранение embedding")
        step4_duration = 0
    
    # Сохраняем информацию о позициях
    for position, position_data in positions_list:
        created_positions.append({
            "id": str(position.id),
            "svor_code": position.svor_code,
            "svor_name": position.svor_name,
        })
    
    total_duration = time.time() - start_time
    logger.info(f"[SVOR Upload] ✅ Успешно создано {len(created_positions)} позиций СВОР")
    logger.info(f"[SVOR Upload] ⏱️ Общее время загрузки: {total_duration:.2f} сек")
    logger.info(f"[SVOR Upload] Детализация времени:")
    logger.info(f"[SVOR Upload]   - Шаг 1 (создание документа): {step1_duration:.2f} сек ({step1_duration/total_duration*100:.1f}%)")
    logger.info(f"[SVOR Upload]   - Шаг 2 (создание позиций): {step2_duration:.2f} сек ({step2_duration/total_duration*100:.1f}%)")
    if embedding_vectors:
        logger.info(f"[SVOR Upload]   - Шаг 3 (создание embedding): {step3_duration:.2f} сек ({step3_duration/total_duration*100:.1f}%)")
        logger.info(f"[SVOR Upload]   - Шаг 4 (сохранение embedding): {step4_duration:.2f} сек ({step4_duration/total_duration*100:.1f}%)")
    logger.info("=" * 60)
    
    return {
        "success": True,
        "message": f"Создано {len(created_positions)} позиций СВОР",
        "document_id": str(svor_document.id),
        "document_name": svor_document.name,
        "positions": created_positions,
    }


@router.post("/svor/upload-csv")
async def upload_svor_from_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UniverseUser = Depends(get_current_user),
):
    """
    Загрузить позиции СВОР из CSV файла
    
    Ожидаемый формат CSV:
    - svor_code: код позиции СВОР (обязательно)
    - svor_name: название позиции СВОР (обязательно)
    - svor_description: описание (опционально)
    """
    import time
    from pathlib import Path
    from app.services.classification_service import build_svor_embedding_text
    from app.services.embedding_service import create_embeddings_batch
    
    logger.info("=" * 60)
    logger.info(f"[SVOR CSV Upload] Начало загрузки СВОР из CSV файла: {file.filename}")
    logger.info(f"[SVOR CSV Upload] Пользователь: {current_user.email} (ID: {current_user.id})")
    
    start_time = time.time()
    
    # Получаем название файла без расширения
    file_name = Path(file.filename).stem if file.filename else "unnamed_svor"
    
    # Читаем CSV файл
    try:
        csv_rows = read_csv_file_from_upload(file)
    except Exception as e:
        logger.error(f"[SVOR CSV Upload] Ошибка чтения CSV: {e}")
        raise HTTPException(status_code=400, detail=f"Ошибка чтения CSV файла: {str(e)}")
    
    if not csv_rows:
        raise HTTPException(status_code=400, detail="CSV файл пуст или не содержит данных")
    
    logger.info(f"[SVOR CSV Upload] Прочитано строк из CSV: {len(csv_rows)}")
    
    # Преобразуем CSV строки в формат данных
    positions_data = []
    for idx, row in enumerate(csv_rows, 1):
        svor_code = row.get("svor_code", "").strip()
        svor_name = row.get("svor_name", "").strip()
        
        if not svor_code or not svor_name:
            logger.warning(f"[SVOR CSV Upload] Строка {idx}: пропущена (отсутствует svor_code или svor_name)")
            continue
        
        positions_data.append({
            "svor_code": svor_code,
            "svor_name": svor_name,
            "svor_description": row.get("svor_description", "").strip() or None,
        })
    
    logger.info(f"[SVOR CSV Upload] Подготовлено позиций для загрузки: {len(positions_data)}")
    
    if not positions_data:
        raise HTTPException(status_code=400, detail="Не найдено валидных позиций СВОР в CSV файле")
    
    # Шаг 1: Создаем документ СВОР
    step1_start = time.time()
    svor_document = SVORDocument(
        name=file_name,
        user_id=current_user.id,
    )
    db.add(svor_document)
    db.flush()
    db.commit()
    step1_duration = time.time() - step1_start
    logger.info(f"[SVOR CSV Upload] ✅ Создан документ СВОР: {svor_document.name} (ID: {svor_document.id})")
    
    # Шаг 2: Создаем позиции
    step2_start = time.time()
    positions_list = []
    embedding_texts = []
    position_to_text_index = {}
    
    for position_data in positions_data:
        position = SVORPosition(
            svor_document_id=svor_document.id,
            svor_code=position_data["svor_code"],
            svor_name=position_data["svor_name"],
            svor_description=position_data["svor_description"],
        )
        db.add(position)
        db.flush()
        
        positions_list.append(position)
        
        embedding_text = build_svor_embedding_text(
            position.svor_code,
            position.svor_name,
            position.svor_description
        )
        embedding_texts.append(embedding_text)
        position_to_text_index[str(position.id)] = len(embedding_texts) - 1
    
    db.commit()
    step2_duration = time.time() - step2_start
    logger.info(f"[SVOR CSV Upload] ✅ Создано позиций: {len(positions_list)}")
    
    # Сохраняем ID позиций для дальнейшего использования
    position_ids = [str(pos.id) for pos in positions_list]
    
    # Шаг 3: Создаем embedding векторы
    step3_start = time.time()
    embedding_model_name = "all-MiniLM-L6-v2"
    try:
        embedding_vectors = create_embeddings_batch(embedding_texts, embedding_model_name)
        step3_duration = time.time() - step3_start
        logger.info(f"[SVOR CSV Upload] ✅ Создано embedding векторов: {len(embedding_vectors)}")
    except Exception as e:
        step3_duration = time.time() - step3_start
        logger.error(f"[SVOR CSV Upload] ❌ Ошибка создания embedding: {e}")
        embedding_vectors = []
    
    # Шаг 4: Сохраняем embedding
    step4_start = time.time()
    if embedding_vectors and len(embedding_vectors) == len(positions_list):
        # Создаем embedding по одному с flush() после каждого, чтобы избежать проблем с bulk insert и UUID
        for idx, position in enumerate(positions_list):
            try:
                # Используем ID позиции напрямую - после flush() это правильный UUID объект
                position_id = position.id
                # Убеждаемся, что это UUID объект, а не строка
                if isinstance(position_id, str):
                    position_id = UUID(position_id)
                
                text_index = position_to_text_index[str(position.id)]
                embedding_vector = embedding_vectors[text_index]
                embedding_text = embedding_texts[text_index]
                
                # Создаем embedding с UUID напрямую
                svor_embedding = SVOREmbedding(
                    svor_position_id=position_id,
                    embedding_vector=embedding_vector,
                    embedding_text=embedding_text,
                    model_name=embedding_model_name,
                )
                db.add(svor_embedding)
                # Делаем flush() после каждого добавления, чтобы избежать bulk insert
                db.flush()
            except Exception as e:
                logger.error(f"[SVOR CSV Upload] Ошибка при создании embedding для позиции {position.id}: {e}")
                import traceback
                logger.error(traceback.format_exc())
                continue
        
        # Финальный коммит всех embedding
        db.commit()
    
    step4_duration = time.time() - step4_start
    
    created_positions = []
    for position in positions_list:
        created_positions.append({
            "id": str(position.id),
            "svor_code": position.svor_code,
            "svor_name": position.svor_name,
        })
    
    total_duration = time.time() - start_time
    logger.info(f"[SVOR CSV Upload] ✅ Успешно загружено {len(created_positions)} позиций СВОР")
    logger.info(f"[SVOR CSV Upload] ⏱️ Общее время: {total_duration:.2f} сек")
    logger.info("=" * 60)
    
    return {
        "success": True,
        "message": f"Загружено {len(created_positions)} позиций СВОР из CSV",
        "document_id": str(svor_document.id),
        "document_name": svor_document.name,
        "positions": created_positions,
        "total_duration": total_duration,
    }


@router.get("/svor/documents")
async def get_svor_documents(
    db: Session = Depends(get_db),
    current_user: UniverseUser = Depends(get_current_user),
):
    """Получить список документов СВОР текущего пользователя"""
    documents = db.query(SVORDocument).filter(
        SVORDocument.user_id == current_user.id
    ).order_by(SVORDocument.created_at.desc()).all()
    
    return {
        "documents": [
            SVORDocumentResponse.model_validate(d).model_dump() for d in documents
        ],
    }


@router.get("/svor/positions")
async def get_svor_positions(
    svor_document_id: Optional[str] = Query(None, description="Фильтр по ID документа СВОР"),
    db: Session = Depends(get_db),
):
    """Получить список позиций СВОР"""
    query = db.query(SVORPosition)
    
    if svor_document_id:
        try:
            document_uuid = UUID(svor_document_id)
            query = query.filter(SVORPosition.svor_document_id == document_uuid)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат svor_document_id")
    
    positions = query.order_by(SVORPosition.svor_code).all()
    
    return {
        "positions": [
            SVORPositionResponse.model_validate(p).model_dump() for p in positions
        ],
    }


# ==================== Эндпоинты для классификации ====================

@router.post("/classification/run")
async def run_classification(
    request: ClassificationRunRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Запустить классификацию элементов
    
    В MVP: запускает фоновую задачу классификации.
    Реальная логика классификации будет реализована в сервисе.
    """
    # Проверяем, что проект и версия существуют
    from app.models.project import Project, ProjectVersion
    from app.utils.identifiers import resolve_project_by_identifier, resolve_version_by_identifier
    
    # Преобразуем идентификаторы в UUID (поддерживаем UUID, shortId, slug)
    project = resolve_project_by_identifier(str(request.project_id), db)
    version = resolve_version_by_identifier(str(request.version_id), db, project.id)
    
    # Получаем элементы из csv_data_rows
    query = db.query(CSVDataRow).filter(
        CSVDataRow.file_upload_id.in_(
            db.query(FileUpload.id).filter(
                and_(
                    FileUpload.project_id == project.id,
                    FileUpload.version_id == version.id,
                )
            )
        )
    )
    
    if request.model_name:
        query = query.filter(CSVDataRow.model_name == request.model_name)
    
    # Подсчитываем уникальные элементы
    # Оптимизация: сначала получаем file_upload_ids как список, затем используем его
    file_upload_ids = [
        row[0] for row in db.query(FileUpload.id).filter(
            and_(
                FileUpload.project_id == project.id,
                FileUpload.version_id == version.id,
            )
        ).all()
    ]
    
    if not file_upload_ids:
        total_elements = 0
    else:
        # Используем более эффективный запрос с готовым списком ID
        count_query = db.query(CSVDataRow.element_id).filter(
            CSVDataRow.file_upload_id.in_(file_upload_ids)
        )
        
        if request.model_name:
            count_query = count_query.filter(CSVDataRow.model_name == request.model_name)
        
        total_elements = count_query.distinct().count()
    
    # Запускаем фоновую задачу классификации
    from app.services.classification_task import classify_elements_task
    
    # Создаем новую сессию БД для фоновой задачи
    from app.core.database import SessionLocal
    background_db = SessionLocal()
    
    try:
        # Проверяем, что выбранные СВОР существуют
        svor_position_ids = None
        if request.svor_position_ids:
            from app.models.ai_classification import SVORPosition
            svor_positions = db.query(SVORPosition).filter(
                SVORPosition.id.in_(request.svor_position_ids)
            ).all()
            if len(svor_positions) != len(request.svor_position_ids):
                raise HTTPException(
                    status_code=400,
                    detail="Некоторые выбранные позиции СВОР не найдены"
                )
            svor_position_ids = request.svor_position_ids
        
        # Получаем similarity_threshold из настроек
        from app.models.ai_classification import ClassificationSettings
        settings = db.query(ClassificationSettings).filter(
            and_(
                ClassificationSettings.project_id == project.id,
                ClassificationSettings.version_id == version.id,
            )
        ).first()
        similarity_threshold = None
        if settings and settings.similarity_threshold:
            similarity_threshold = float(settings.similarity_threshold)
        
        # Запускаем синхронную задачу классификации
        background_tasks.add_task(
            classify_elements_task,
            background_db,
            project.id,
            version.id,
            request.file_upload_id,
            request.model_name,
            "all-MiniLM-L6-v2",  # embedding_model_name
            svor_position_ids,
            similarity_threshold,
        )
    except Exception as e:
        background_db.close()
        logger.error(f"Ошибка запуска задачи классификации: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка запуска классификации: {str(e)}")
    
    job_id = uuid.uuid4()
    
    return ClassificationRunResponse(
        job_id=job_id,
        status="processing",
        total_elements=total_elements,
        processed_elements=0,
        message="Классификация запущена",
    )


@router.get("/classification/results")
async def get_classification_results(
    project_id: str = Query(..., description="ID проекта (UUID, shortId или slug)"),
    version_id: str = Query(..., description="ID версии (UUID, shortId или slug)"),
    element_id: Optional[str] = Query(None, description="Фильтр по element_id"),
    db: Session = Depends(get_db),
):
    """Получить результаты классификации"""
    from app.utils.identifiers import resolve_project_by_identifier, resolve_version_by_identifier
    
    # Преобразуем идентификаторы в UUID
    project = resolve_project_by_identifier(project_id, db)
    version = resolve_version_by_identifier(version_id, db, project.id)
    
    query = db.query(ClassificationResult).filter(
        and_(
            ClassificationResult.project_id == project.id,
            ClassificationResult.version_id == version.id,
            ClassificationResult.status == "draft",  # Только черновые результаты
        )
    )
    
    if element_id:
        query = query.filter(ClassificationResult.element_id == element_id)
    
    results = query.order_by(
        ClassificationResult.element_id,
        ClassificationResult.rank
    ).all()
    
    # Группируем по element_id
    elements_dict = {}
    for result in results:
        if result.element_id not in elements_dict:
            elements_dict[result.element_id] = {
                "element_id": result.element_id,
                "category": result.model_name,  # TODO: Получить category из csv_data_rows
                "proposals": [],
            }
        
        proposal = ClassificationProposal(
            svor_position_id=result.svor_position_id,
            svor_code=result.svor_position.svor_code,
            svor_name=result.svor_position.svor_name,
            rank=result.rank,
            final_score=float(result.final_score),
            semantic_similarity=float(result.semantic_similarity),
            structured_boost=float(result.structured_boost) if result.structured_boost else 0.0,
        )
        elements_dict[result.element_id]["proposals"].append(proposal)
    
    # Сортируем proposals по rank
    for element_data in elements_dict.values():
        element_data["proposals"].sort(key=lambda x: x.rank)
    
    return ClassificationResultsResponse(
        project_id=project.id,
        version_id=version.id,
        total_elements=len(elements_dict),
        classified_elements=len(elements_dict),
        results=list(elements_dict.values()),
    )


# ==================== Эндпоинты для подтверждения ====================

@router.post("/classification/confirm")
async def confirm_classification(
    request: ClassificationConfirmRequest,
    db: Session = Depends(get_db),
):
    """Подтвердить классификацию элемента"""
    # Находим результат классификации
    result = db.query(ClassificationResult).filter(
        and_(
            ClassificationResult.element_id == request.element_id,
            ClassificationResult.project_id == request.project_id,
            ClassificationResult.version_id == request.version_id,
            ClassificationResult.svor_position_id == request.svor_position_id,
            ClassificationResult.status == "draft",
        )
    ).first()
    
    if not result:
        raise HTTPException(status_code=404, detail="Результат классификации не найден")
    
    # Обновляем статус
    result.status = "confirmed"
    
    # Создаем событие обучения
    training_event = ClassificationTrainingEvent(
        element_id=request.element_id,
        project_id=request.project_id,
        version_id=request.version_id,
        svor_id=result.svor_position_id,
        proposed_position_id=result.id,
        final_position_id=request.svor_position_id,
        action_type="confirm",
        element_embedding_id=result.element_embedding_id,
    )
    db.add(training_event)
    
    db.commit()
    
    return ClassificationActionResponse(
        success=True,
        message="Классификация подтверждена",
        training_event_id=training_event.id,
    )


@router.post("/classification/change")
async def change_classification(
    request: ClassificationChangeRequest,
    db: Session = Depends(get_db),
):
    """Изменить классификацию элемента"""
    # Находим текущий результат (rank=1)
    current_result = db.query(ClassificationResult).filter(
        and_(
            ClassificationResult.element_id == request.element_id,
            ClassificationResult.project_id == request.project_id,
            ClassificationResult.version_id == request.version_id,
            ClassificationResult.rank == 1,
            ClassificationResult.status == "draft",
        )
    ).first()
    
    if not current_result:
        raise HTTPException(status_code=404, detail="Результат классификации не найден")
    
    # Обновляем статус текущего результата
    current_result.status = "changed"
    
    # Создаем событие обучения
    training_event = ClassificationTrainingEvent(
        element_id=request.element_id,
        project_id=request.project_id,
        version_id=request.version_id,
        svor_id=current_result.svor_position_id,
        proposed_position_id=current_result.id,
        final_position_id=request.new_svor_position_id,
        action_type="change",
        element_embedding_id=current_result.element_embedding_id,
    )
    db.add(training_event)
    
    db.commit()
    
    return ClassificationActionResponse(
        success=True,
        message="Классификация изменена",
        training_event_id=training_event.id,
    )


@router.post("/classification/reject")
async def reject_classification(
    request: ClassificationRejectRequest,
    db: Session = Depends(get_db),
):
    """Отклонить классификацию элемента"""
    # Находим все результаты для элемента
    results = db.query(ClassificationResult).filter(
        and_(
            ClassificationResult.element_id == request.element_id,
            ClassificationResult.project_id == request.project_id,
            ClassificationResult.version_id == request.version_id,
            ClassificationResult.status == "draft",
        )
    ).all()
    
    if not results:
        raise HTTPException(status_code=404, detail="Результаты классификации не найдены")
    
    # Обновляем статус всех результатов
    for result in results:
        result.status = "rejected"
    
    # Создаем событие обучения (используем rank=1 как предложенную позицию)
    main_result = next((r for r in results if r.rank == 1), results[0])
    training_event = ClassificationTrainingEvent(
        element_id=request.element_id,
        project_id=request.project_id,
        version_id=request.version_id,
        svor_id=main_result.svor_position_id,
        proposed_position_id=main_result.id,
        final_position_id=None,  # При reject нет финальной позиции
        action_type="reject",
        element_embedding_id=main_result.element_embedding_id,
    )
    db.add(training_event)
    
    db.commit()
    
    return ClassificationActionResponse(
        success=True,
        message="Классификация отклонена",
        training_event_id=training_event.id,
    )


# ==================== Эндпоинты для настроек классификации ====================

@router.post("/classification/settings")
async def save_classification_settings(
    request: ClassificationSettingsRequest,
    db: Session = Depends(get_db),
):
    """Сохранить настройки классификации для версии проекта"""
    from app.models.project import Project, ProjectVersion
    from app.utils.identifiers import resolve_project_by_identifier, resolve_version_by_identifier
    
    # Преобразуем идентификаторы в UUID
    project = resolve_project_by_identifier(str(request.project_id), db)
    version = resolve_version_by_identifier(str(request.version_id), db, project.id)
    
    # Проверяем, что выбранные СВОР существуют
    if request.selected_svor_position_ids:
        svor_positions = db.query(SVORPosition).filter(
            SVORPosition.id.in_(request.selected_svor_position_ids)
        ).all()
        if len(svor_positions) != len(request.selected_svor_position_ids):
            raise HTTPException(
                status_code=400,
                detail="Некоторые выбранные позиции СВОР не найдены"
            )
    
    # Ищем существующие настройки или создаем новые
    settings = db.query(ClassificationSettings).filter(
        and_(
            ClassificationSettings.project_id == project.id,
            ClassificationSettings.version_id == version.id,
        )
    ).first()
    
    if settings:
        settings.selected_svor_position_ids = request.selected_svor_position_ids
        if request.similarity_threshold is not None:
            settings.similarity_threshold = request.similarity_threshold
    else:
        settings = ClassificationSettings(
            project_id=project.id,
            version_id=version.id,
            selected_svor_position_ids=request.selected_svor_position_ids,
            similarity_threshold=request.similarity_threshold if request.similarity_threshold is not None else 0.3,
        )
        db.add(settings)
    
    db.commit()
    db.refresh(settings)
    
    return ClassificationSettingsResponse(
        project_id=str(settings.project_id),
        version_id=str(settings.version_id),
        selected_svor_position_ids=[str(id) for id in (settings.selected_svor_position_ids or [])],
        similarity_threshold=float(settings.similarity_threshold) if settings.similarity_threshold else 0.3,
        updated_at=settings.updated_at,
    )


@router.get("/classification/settings")
async def get_classification_settings(
    project_id: str = Query(..., description="ID проекта (UUID, shortId или slug)"),
    version_id: str = Query(..., description="ID версии (UUID, shortId или slug)"),
    db: Session = Depends(get_db),
):
    """Получить настройки классификации для версии проекта"""
    from app.models.project import Project, ProjectVersion
    from app.utils.identifiers import resolve_project_by_identifier, resolve_version_by_identifier
    
    # Преобразуем идентификаторы в UUID
    project = resolve_project_by_identifier(str(project_id), db)
    version = resolve_version_by_identifier(str(version_id), db, project.id)
    
    # Ищем настройки
    settings = db.query(ClassificationSettings).filter(
        and_(
            ClassificationSettings.project_id == project.id,
            ClassificationSettings.version_id == version.id,
        )
    ).first()
    
    if not settings:
        # Возвращаем пустые настройки, если не найдены
        return ClassificationSettingsResponse(
            project_id=str(project.id),
            version_id=str(version.id),
            selected_svor_position_ids=[],
            similarity_threshold=0.3,  # Значение по умолчанию
            updated_at=version.updated_at or version.created_at,
        )
    
    return ClassificationSettingsResponse(
        project_id=str(settings.project_id),
        version_id=str(settings.version_id),
        selected_svor_position_ids=[str(id) for id in (settings.selected_svor_position_ids or [])],
        similarity_threshold=float(settings.similarity_threshold) if settings.similarity_threshold else 0.3,
        updated_at=settings.updated_at,
    )

