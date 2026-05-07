# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for FinPilot AI backend
import os, sys

block_cipher = None
backend_dir  = os.path.dirname(os.path.abspath(SPEC))
routes_dir   = os.path.join(backend_dir, 'routes')

a = Analysis(
    ['run.py'],
    pathex=[backend_dir],
    binaries=[],
    datas=[
        # Backend source modules (main, models, schemas, database, pdf_generator…)
        (os.path.join(backend_dir, '*.py'), '.'),
        # Route modules
        (os.path.join(routes_dir, '*.py'), 'routes'),
        # Letterhead image
        (os.path.join(backend_dir, 'assets', '*.jpg'), 'assets'),
    ],
    hiddenimports=[
        # Uvicorn internals
        'uvicorn', 'uvicorn.logging',
        'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio',
        'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan', 'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
        'uvicorn.config', 'uvicorn.main',
        # FastAPI / Starlette
        'fastapi', 'fastapi.middleware.cors',
        'starlette', 'starlette.middleware', 'starlette.middleware.cors',
        'starlette.routing', 'starlette.responses', 'starlette.requests',
        # SQLAlchemy
        'sqlalchemy', 'sqlalchemy.orm', 'sqlalchemy.ext.declarative',
        'sqlalchemy.dialects.sqlite', 'sqlalchemy.dialects.sqlite.pysqlite',
        'sqlalchemy.sql', 'sqlalchemy.sql.expression',
        # Pydantic v2
        'pydantic', 'pydantic.v1',
        # AnyIO
        'anyio', 'anyio._backends._asyncio', 'anyio._backends._trio',
        # Misc
        'aiofiles', 'multipart', 'python_multipart',
        'h11', 'httptools', 'websockets',
        # ReportLab
        'reportlab', 'reportlab.lib', 'reportlab.lib.pagesizes',
        'reportlab.lib.units', 'reportlab.lib.colors', 'reportlab.lib.styles',
        'reportlab.lib.enums', 'reportlab.platypus', 'reportlab.pdfgen',
        'reportlab.pdfgen.canvas',
        # PIL / Pillow — required by reportlab.lib.utils at import time
        'PIL', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont',
        # Backend application modules
        'main', 'models', 'schemas', 'database', 'pdf_generator', 'ai_parser',
        # Route modules
        'routes.company', 'routes.customers', 'routes.suppliers', 'routes.items',
        'routes.quotations', 'routes.invoices', 'routes.payments', 'routes.ledger',
        'routes.reports', 'routes.ai_command', 'routes.bank_accounts',
        'routes.bank_transactions', 'routes.cheques', 'routes.expenses',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', '_tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,   # No console window in production
)

coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False, upx=False, upx_exclude=[],
    name='backend',
)
