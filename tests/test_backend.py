import os
import time
from uuid import uuid4
from io import BytesIO

os.environ['SECRET_KEY'] = 'test-secret-only-' * 4
os.environ['DATABASE_URL'] = 'sqlite://'

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app
from backend.api.deps import get_db
from backend.ai.gemini_client import get_ai
from backend.ai import prompts
from backend.db.base_class import Base
from backend.models.study import StudySession
from backend.schemas.study import ObjectiveSet, Assessment, Lesson, ChatAnswer

class FakeAI:
    """Deterministic fixtures, NOT a real assessment model."""
    fail_lesson = False
    wrong_id = False
    bad_page = False
    calls = 0

    def structured(self, instruction, payload, schema):
        self.calls += 1
        if schema is ObjectiveSet:
            return ObjectiveSet(objectives=[{'title': 'Ohm law', 'expected_points': ['V = IR', 'ohmic conditions'], 'source_pages': [99 if self.bad_page else 1]}])
        if schema is Assessment:
            text = payload['student_answer']
            status = 'incorrect' if 'V = I / R' in text else 'correct' if 'ohmic' in text else 'not_demonstrated' if 'remember' in text else 'partial'
            return Assessment(items=[{'concept_id': 'invalid' if self.wrong_id else o['id'], 'status': status,
                'evidence': '' if status == 'not_demonstrated' else text, 'missing_points': [],
                'misconceptions': ['Incorrect formula'] if status == 'incorrect' else [], 'follow_up_question': 'When does this apply?'} for o in payload['objectives']], summary='Fixture assessment')
        if schema is Lesson:
            if self.fail_lesson:
                raise HTTPException(502, 'Simulated outage')
            return Lesson(markdown='For an ohmic resistor, V = IR.', check_questions=['What does R mean?'], source_pages=[1])
        return ChatAnswer(answer='Resistance is measured in ohms.', source_pages=[1])

@pytest.fixture
def setup():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    def db_override():
        with factory() as db:
            yield db
    ai = FakeAI()
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_ai] = lambda: ai
    with TestClient(app) as client:
        yield client, factory, ai
    app.dependency_overrides.clear()
    engine.dispose()


def account(client, email='student@example.com'):
    # OAuth2PasswordRequestForm's "username" field carries the email (see
    # auth.py) -- unrelated to the users.username column, which just needs
    # to be present and unique, so derive it from the email's local part.
    username = email.split('@')[0]
    result = client.post('/api/v1/auth/signup', json={'email': email, 'username': username, 'password': 'password123'})
    assert result.status_code == 200, result.text
    result = client.post('/api/v1/auth/login/access-token', data={'username': email, 'password': 'password123'})
    assert result.status_code == 200, result.text
    return {'Authorization': 'Bearer ' + result.json()['access_token']}


def document(client, headers):
    text = b'For an ohmic resistor, voltage equals current times resistance. V = IR. Resistance is measured in ohms.'
    result = client.post('/api/v1/documents', headers=headers, files={'file': ('notes.txt', text, 'text/plain')})
    assert result.status_code == 201, result.text
    return result.json()['id']


def session(client, headers, did):
    result = client.post('/api/v1/sessions', headers=headers, json={'document_id': did, 'study_seconds': 5, 'break_seconds': 5})
    assert result.status_code == 201, result.text
    return result.json()['id']


def expire(factory, sid):
    with factory() as db:
        db.get(StudySession, sid).deadline = time.time() - 1
        db.commit()


def test_full_cycle_resume_and_idempotency(setup):
    client, factory, ai = setup
    headers = account(client)
    did = document(client, headers)
    sid = session(client, headers, did)
    url = f'/api/v1/sessions/{sid}'
    assert client.post(url+'/advance', headers=headers).status_code == 409
    assert client.post(url+'/chat', headers=headers, json={'message': 'What is resistance?'}).status_code == 200
    paused = client.post(url+'/pause', headers=headers).json()
    assert paused['paused'] and paused['deadline'] is None
    assert client.post(url+'/advance', headers=headers).status_code == 409
    resumed = client.post(url+'/resume', headers=headers).json()
    assert resumed['remaining_seconds'] == paused['remaining_seconds']
    expire(factory, sid)
    assert client.post(url+'/advance', headers=headers).json()['phase'] == 'recall'
    assert client.post(url+'/chat', headers=headers, json={'message': 'Help'}).status_code == 409
    assert client.get(url+'/chat', headers=headers).status_code == 409
    request = {'submission_id': str(uuid4()), 'text': 'V = IR'}
    answer = client.post(url+'/recall', headers=headers, json=request)
    assert answer.status_code == 200, answer.text
    calls = ai.calls
    assert client.post(url+'/recall', headers=headers, json=request).json() == answer.json()
    assert ai.calls == calls
    assert client.post(url+'/recall', headers=headers, json={**request, 'text': 'Changed answer'}).status_code == 409
    assert client.get(f'/api/v1/documents/{did}', headers=headers).json()['progress']['c1']['attempt_count'] == 1
    assert len(client.get(url+'/attempts', headers=headers).json()) == 1
    assert client.post(url+'/advance', headers=headers).json()['phase'] == 'break'
    expire(factory, sid)
    assert client.post(url+'/advance', headers=headers).json()['phase'] == 'review'
    expire(factory, sid)
    assert client.post(url+'/advance', headers=headers).json()['phase'] == 'recall'
    assert client.get(url, headers=headers).json()['lesson'] is None
    assert client.post(url+'/complete', headers=headers).json()['phase'] == 'completed'
    assert client.post(url+'/resume', headers=headers).status_code == 409


def test_wellbeing_extends_break(setup):
    client, factory, ai = setup
    headers = account(client)
    did = document(client, headers)
    sid = session(client, headers, did)
    url = f'/api/v1/sessions/{sid}'
    expire(factory, sid)
    assert client.post(url+'/advance', headers=headers).json()['phase'] == 'recall'
    report = {'avg_stress': 62.5, 'pct_high_stress': 45.0, 'longest_high_stress_run_sec': 310.0,
              'blink_rate_per_min': 22.0, 'drowsiness_alert_count': 2, 'extend_break': True, 'extra_break_minutes': 5}
    posted = client.post(url+'/wellbeing', headers=headers, json=report)
    assert posted.status_code == 200, posted.text
    assert posted.json()['round_number'] == 1 and posted.json()['extra_break_minutes'] == 5, posted.text
    assert client.get(url+'/wellbeing', headers=headers).json()[0]['round_number'] == 1
    # Re-reporting the same round upserts rather than erroring or duplicating.
    client.post(url+'/wellbeing', headers=headers, json={**report, 'extra_break_minutes': 5})
    assert len(client.get(url+'/wellbeing', headers=headers).json()) == 1
    request = {'submission_id': str(uuid4()), 'text': 'V = IR'}
    assert client.post(url+'/recall', headers=headers, json=request).status_code == 200
    result = client.post(url+'/advance', headers=headers).json()  # feedback -> break
    assert result['phase'] == 'break'
    # session() sets break_seconds=5; the reported +5 minutes adds 300s on top.
    assert 300 <= result['remaining_seconds'] <= 306


def test_wellbeing_without_extend_flag_does_not_extend_break(setup):
    client, factory, ai = setup
    headers = account(client)
    did = document(client, headers)
    sid = session(client, headers, did)
    url = f'/api/v1/sessions/{sid}'
    expire(factory, sid)
    client.post(url+'/advance', headers=headers)
    client.post(url+'/wellbeing', headers=headers, json={'extend_break': False, 'extra_break_minutes': 0})
    request = {'submission_id': str(uuid4()), 'text': 'V = IR'}
    client.post(url+'/recall', headers=headers, json=request)
    result = client.post(url+'/advance', headers=headers).json()
    assert result['phase'] == 'break'
    assert result['remaining_seconds'] <= 6


def test_ownership_and_auth(setup):
    client, _, _ = setup
    owner = account(client)
    other = account(client, 'other@example.com')
    did = document(client, owner)
    sid = session(client, owner, did)
    assert client.get('/api/v1/documents').status_code == 401
    assert client.get('/api/v1/documents', headers=other).json() == []
    for suffix in ['', '/content', '/file']:
        assert client.get(f'/api/v1/documents/{did}'+suffix, headers=other).status_code == 404
    assert client.post(f'/api/v1/sessions/{sid}/pause', headers=other).status_code == 404
    assert client.get('/api/v1/sessions', headers=other).json() == []
    assert client.post('/api/v1/auth/login/access-token', data={'username': 'student@example.com', 'password': 'wrong'}).status_code == 400


@pytest.mark.parametrize('text,status', [('V = IR for an ohmic resistor', 'correct'), ('V = IR', 'partial'), ('V = I / R', 'incorrect'), ('I cannot remember', 'not_demonstrated')])
def test_status_persistence(setup, text, status):
    client, factory, _ = setup
    h = account(client)
    did = document(client, h)
    sid = session(client, h, did)
    expire(factory, sid)
    client.post(f'/api/v1/sessions/{sid}/advance', headers=h)
    r = client.post(f'/api/v1/sessions/{sid}/recall', headers=h, json={'submission_id': str(uuid4()), 'text': text})
    assert r.status_code == 200, r.text
    assert client.get(f'/api/v1/documents/{did}', headers=h).json()['progress']['c1']['status'] == status


@pytest.mark.parametrize('failure', ['fail_lesson', 'wrong_id'])
def test_failure_preserves_recall_for_retry(setup, failure):
    client, factory, ai = setup
    h = account(client)
    did = document(client, h)
    sid = session(client, h, did)
    expire(factory, sid)
    url = f'/api/v1/sessions/{sid}'
    client.post(url+'/advance', headers=h)
    setattr(ai, failure, True)
    req = {'submission_id': str(uuid4()), 'text': 'V = IR'}
    assert client.post(url+'/recall', headers=h, json=req).status_code == 502
    assert client.get(url, headers=h).json()['phase'] == 'recall'
    assert client.get(f'/api/v1/documents/{did}', headers=h).json()['progress'] == {}
    setattr(ai, failure, False)
    assert client.post(url+'/recall', headers=h, json=req).status_code == 200


def test_bad_uploads_and_ai_pages(setup):
    from pypdf import PdfWriter
    client, _, ai = setup
    h = account(client)
    for name, data, status in [('file.exe', b'x'*50, 415), ('file.pdf', b'not a pdf', 422), ('file.txt', b'hi', 422), ('file.txt', b'x' * 60001, 413)]:
        assert client.post('/api/v1/documents', headers=h, files={'file': (name, data)}).status_code == status
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    stream = BytesIO()
    writer.write(stream)
    assert client.post('/api/v1/documents', headers=h, files={'file': ('scan.pdf', stream.getvalue())}).status_code == 422
    ai.bad_page = True
    assert client.post('/api/v1/documents', headers=h, files={'file': ('text.txt', b'A useful passage about resistance and current in a simple circuit.')} ).status_code == 502
    assert client.get('/api/v1/documents', headers=h).json() == []


def test_progress_isolated_between_documents(setup):
    client, factory, _ = setup
    h = account(client)
    first, second = document(client, h), document(client, h)
    sid = session(client, h, first)
    expire(factory, sid)
    client.post(f'/api/v1/sessions/{sid}/advance', headers=h)
    client.post(f'/api/v1/sessions/{sid}/recall', headers=h, json={'submission_id': str(uuid4()), 'text': 'V = IR'})
    assert client.get(f'/api/v1/documents/{second}', headers=h).json()['progress'] == {}


def test_text_pdf_extraction(setup):
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    client, _, _ = setup
    h = account(client)
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 12 Tf 72 720 Td (Voltage equals current times resistance for an ohmic resistor. V = IR.) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    data = BytesIO()
    writer.write(data)
    response = client.post('/api/v1/documents', headers=h, files={'file': ('ohms.pdf', data.getvalue(), 'application/pdf')})
    assert response.status_code == 201, response.text
    did = response.json()['id']
    assert 'ohmic' in client.get(f'/api/v1/documents/{did}/content', headers=h).json()['objects'][0]['content']
    saved = client.get(f'/api/v1/documents/{did}/file', headers=h)
    assert saved.content == data.getvalue()


def test_gemini_adapter_validation(monkeypatch):
    from types import SimpleNamespace
    from backend.ai.gemini_client import GeminiClient
    from backend.core.config import settings
    captured = {}
    def generate(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(text='{"answer":"Example answer","source_pages":[1]}')
    adapter = GeminiClient.__new__(GeminiClient)
    adapter.client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    monkeypatch.setattr(settings, 'GEMINI_MODEL', 'test-model')
    result = adapter.structured(prompts.CHAT, {'question': 'Explain'}, ChatAnswer)
    assert result.answer == 'Example answer'
    assert captured['model'] == 'test-model'
    assert captured['config'].response_json_schema == ChatAnswer.model_json_schema()
    adapter.client.models.generate_content = lambda **kwargs: SimpleNamespace(text='not json')
    with pytest.raises(HTTPException) as caught:
        adapter.structured(prompts.CHAT, {}, ChatAnswer)
    assert caught.value.status_code == 502


def test_object_storage_upload_and_download(setup, monkeypatch):
    """With Vultr configured, bytes go to the bucket and /file redirects.

    Uses a fake S3 client rather than a live bucket: the point is that
    create_document() stops writing the blob and that /file hands back a
    presigned redirect instead of the body.
    """
    from backend.services import storage
    client, factory, ai = setup
    bucket = {}

    class FakeS3:
        def put_object(self, Bucket, Key, Body, ContentType):
            bucket[Key] = (Body, ContentType)

        def generate_presigned_url(self, op, Params, ExpiresIn):
            return f'https://example-bucket.invalid/{Params["Key"]}?signed=1'

    monkeypatch.setattr(storage, 'configured', lambda: True)
    monkeypatch.setattr(storage, '_client', lambda: FakeS3())
    monkeypatch.setattr(storage.settings, 'VULTR_STORAGE_BUCKET', 'test-bucket')

    h = account(client, 'storage@example.com')
    text = b'For an ohmic resistor, voltage equals current times resistance. V = IR.'
    did = client.post('/api/v1/documents', headers=h,
                      files={'file': ('my notes!.txt', text, 'text/plain')}).json()['id']

    key = f'users/1/{did}/my_notes_.txt'
    assert bucket[key] == (text, 'text/plain')
    with factory() as db:
        from backend.models.document import Document
        row = db.query(Document).filter_by(document_id=did).first()
        # The whole point of object storage: the blob column stays empty.
        assert row.original is None and row.storage_key == key

    saved = client.get(f'/api/v1/documents/{did}/file', headers=h, follow_redirects=False)
    assert saved.status_code == 307
    assert saved.headers['location'] == f'https://example-bucket.invalid/{key}?signed=1'


def test_unconfigured_object_storage_falls_back_to_the_database(setup):
    """No Vultr settings is a supported mode, not an error."""
    from backend.services import storage
    client, factory, ai = setup
    assert not storage.configured()
    h = account(client, 'blob@example.com')
    did = document(client, h)
    assert client.get(f'/api/v1/documents/{did}/file', headers=h).status_code == 200
