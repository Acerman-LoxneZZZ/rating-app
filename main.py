import os
import uuid
import shutil
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import engine, get_db, Base, SessionLocal
from models import Person, RatingChange, PenaltyTemplate, RewardTemplate

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="People Rating System")

# Ensure directories exist
os.makedirs("uploads", exist_ok=True)
os.makedirs("static", exist_ok=True)

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize default templates if none exist
db = SessionLocal()
try:
    if db.query(PenaltyTemplate).count() == 0:
        db.add(PenaltyTemplate(name="Проход в обуви", penalty_value=25))
        db.add(PenaltyTemplate(name="Не прибрано", penalty_value=25))
        db.commit()
    if db.query(RewardTemplate).count() == 0:
        db.add(RewardTemplate(name="Помыл посуду", reward_value=15))
        db.add(RewardTemplate(name="Сделал домашку", reward_value=20))
        db.commit()
finally:
    db.close()

# Mount static directories
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/static", StaticFiles(directory="static"), name="static")


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.get("/")
async def serve_index():
    """Serve the main SPA page."""
    return FileResponse("static/index.html")


@app.get("/manifest.json")
async def serve_manifest():
    """Serve PWA manifest."""
    return FileResponse("static/manifest.json", media_type="application/json")


@app.get("/service-worker.js")
async def serve_sw():
    """Serve PWA service worker."""
    return FileResponse("static/service-worker.js", media_type="application/javascript")


# ---------------------------------------------------------------------------
# People API
# ---------------------------------------------------------------------------

@app.get("/api/people")
def list_people(db: Session = Depends(get_db)):
    """Return all people ordered by rating descending."""
    people = db.query(Person).order_by(desc(Person.rating)).all()
    return [p.to_dict() for p in people]


@app.post("/api/people")
async def create_person(
    name: str = Form(...),
    description: str = Form(""),
    rating: int = Form(50),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """Create a new person with optional photo upload."""
    if not 1 <= rating <= 100:
        raise HTTPException(400, "Rating must be between 1 and 100")

    photo_url = ""
    if photo and photo.filename:
        ext = os.path.splitext(photo.filename)[1] or ".png"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join("uploads", filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(photo.file, f)
        photo_url = f"/uploads/{filename}"

    person = Person(
        name=name,
        description=description,
        photo_url=photo_url,
        rating=rating,
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person.to_dict()


@app.get("/api/people/{person_id}")
def get_person(person_id: int, db: Session = Depends(get_db)):
    """Get a single person by ID."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    return person.to_dict()


@app.put("/api/people/{person_id}")
async def update_person(
    person_id: int,
    name: str = Form(...),
    description: str = Form(""),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """Update person details (name, description, photo). Rating is changed separately."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    person.name = name
    person.description = description

    if photo and photo.filename:
        # Remove old photo if exists
        if person.photo_url:
            old_path = person.photo_url.lstrip("/")
            if os.path.exists(old_path):
                os.remove(old_path)

        ext = os.path.splitext(photo.filename)[1] or ".png"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join("uploads", filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(photo.file, f)
        person.photo_url = f"/uploads/{filename}"

    db.commit()
    db.refresh(person)
    return person.to_dict()


@app.delete("/api/people/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db)):
    """Delete a person and their rating history."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    # Remove photo file
    if person.photo_url:
        old_path = person.photo_url.lstrip("/")
        if os.path.exists(old_path):
            os.remove(old_path)

    db.delete(person)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Rating API
# ---------------------------------------------------------------------------

@app.post("/api/people/{person_id}/rating")
def change_rating(
    person_id: int,
    new_rating: int = Form(...),
    comment: str = Form(""),
    db: Session = Depends(get_db),
):
    """Change a person's rating and log the change."""
    if not 1 <= new_rating <= 100:
        raise HTTPException(400, "Rating must be between 1 and 100")

    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    old_rating = person.rating
    if old_rating == new_rating:
        raise HTTPException(400, "New rating is the same as the current one")

    change = RatingChange(
        person_id=person.id,
        old_rating=old_rating,
        new_rating=new_rating,
        comment=comment,
    )
    person.rating = new_rating
    db.add(change)
    db.commit()
    db.refresh(person)
    db.refresh(change)
    return {"person": person.to_dict(), "change": change.to_dict()}


@app.get("/api/people/{person_id}/history")
def get_rating_history(person_id: int, db: Session = Depends(get_db)):
    """Get the rating change history for a person."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")

    changes = (
        db.query(RatingChange)
        .filter(RatingChange.person_id == person_id)
        .order_by(desc(RatingChange.created_at))
        .all()
    )
    return [c.to_dict() for c in changes]


# ---------------------------------------------------------------------------
# Leaderboard API
# ---------------------------------------------------------------------------

@app.get("/api/leaderboard")
def get_leaderboard(db: Session = Depends(get_db)):
    """Get top people sorted by rating for leaderboard display."""
    people = db.query(Person).order_by(desc(Person.rating)).all()
    return [p.to_dict() for p in people]


# ---------------------------------------------------------------------------
# Penalties API
# ---------------------------------------------------------------------------

@app.get("/api/penalties")
def list_penalties(db: Session = Depends(get_db)):
    """List all penalty templates."""
    templates = db.query(PenaltyTemplate).all()
    return [t.to_dict() for t in templates]


@app.post("/api/penalties")
def create_penalty(
    name: str = Form(...),
    penalty_value: int = Form(25),
    db: Session = Depends(get_db)
):
    """Create a new penalty template."""
    template = PenaltyTemplate(name=name, penalty_value=penalty_value)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template.to_dict()


@app.delete("/api/penalties/{penalty_id}")
def delete_penalty(penalty_id: int, db: Session = Depends(get_db)):
    """Delete a penalty template."""
    template = db.query(PenaltyTemplate).filter(PenaltyTemplate.id == penalty_id).first()
    if not template:
        raise HTTPException(404, "Penalty template not found")
    db.delete(template)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Rewards API
# ---------------------------------------------------------------------------

@app.get("/api/rewards")
def list_rewards(db: Session = Depends(get_db)):
    """List all reward templates."""
    templates = db.query(RewardTemplate).all()
    return [t.to_dict() for t in templates]


@app.post("/api/rewards")
def create_reward(
    name: str = Form(...),
    reward_value: int = Form(25),
    db: Session = Depends(get_db)
):
    """Create a new reward template."""
    template = RewardTemplate(name=name, reward_value=reward_value)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template.to_dict()


@app.delete("/api/rewards/{reward_id}")
def delete_reward(reward_id: int, db: Session = Depends(get_db)):
    """Delete a reward template."""
    template = db.query(RewardTemplate).filter(RewardTemplate.id == reward_id).first()
    if not template:
        raise HTTPException(404, "Reward template not found")
    db.delete(template)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)