from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from database import Base


class Person(Base):
    """A person in the rating system."""
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    photo_url = Column(Text, default="")
    rating = Column(Integer, default=50)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    rating_history = relationship(
        "RatingChange", back_populates="person",
        cascade="all, delete-orphan", order_by="RatingChange.created_at.desc()"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "photo_url": self.photo_url,
            "rating": self.rating,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RatingChange(Base):
    """A record of a rating change for a person."""
    __tablename__ = "rating_changes"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False)
    old_rating = Column(Integer, nullable=False)
    new_rating = Column(Integer, nullable=False)
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    person = relationship("Person", back_populates="rating_history")

    def to_dict(self):
        return {
            "id": self.id,
            "person_id": self.person_id,
            "old_rating": self.old_rating,
            "new_rating": self.new_rating,
            "comment": self.comment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PenaltyTemplate(Base):
    """A template for a quick penalty reason and rating deduction."""
    __tablename__ = "penalty_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    penalty_value = Column(Integer, default=25)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "penalty_value": self.penalty_value,
        }


class RewardTemplate(Base):
    """A template for a quick reward reason and rating addition."""
    __tablename__ = "reward_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    reward_value = Column(Integer, default=25)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "reward_value": self.reward_value,
        }

