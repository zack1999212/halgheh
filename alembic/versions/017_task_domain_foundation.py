"""task domain foundation

Tasks, hierarchical subtasks, assignments with history, comments,
user-owned labels, and the immutable activity audit trail.

Revision ID: 017
Revises: 016
Create Date: 2026-11-17 20:56:28.303927

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "017"
down_revision: Union[str, Sequence[str], None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the task domain (6 tables)."""

    op.create_table('task_labels',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.CheckConstraint("color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'", name='ck_task_labels_color_format'),
    sa.CheckConstraint('char_length(name) > 0', name='ck_task_labels_name_not_empty'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_labels_created_by', 'task_labels', ['created_by'], unique=False)
    op.create_index('uq_task_labels_creator_name', 'task_labels', ['created_by', 'name'], unique=True)
    op.create_table('tasks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.String(), server_default=sa.text("'todo'"), nullable=False),
    sa.Column('priority', sa.String(), server_default=sa.text("'medium'"), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('parent_task_id', sa.Integer(), nullable=True),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(status = 'done' AND completed_at IS NOT NULL) OR (status != 'done' AND completed_at IS NULL)", name='ck_tasks_completed_state'),
    sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'urgent')", name='ck_tasks_priority'),
    sa.CheckConstraint("status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')", name='ck_tasks_status'),
    sa.CheckConstraint('char_length(title) > 0', name='ck_tasks_title_not_empty'),
    sa.CheckConstraint('parent_task_id IS NULL OR parent_task_id != id', name='ck_tasks_parent_not_self'),
    sa.CheckConstraint('start_date IS NULL OR due_date IS NULL OR due_date >= start_date', name='ck_tasks_date_order'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['parent_task_id'], ['tasks.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tasks_created_by', 'tasks', ['created_by'], unique=False)
    op.create_index('ix_tasks_created_by_status', 'tasks', ['created_by', 'status'], unique=False)
    op.create_index('ix_tasks_due_date', 'tasks', ['due_date'], unique=False)
    op.create_index('ix_tasks_parent_task_id', 'tasks', ['parent_task_id'], unique=False)
    op.create_table('task_activities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=True),
    sa.Column('actor_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('old_value', sa.Text(), nullable=True),
    sa.Column('new_value', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_activities_actor_id', 'task_activities', ['actor_id'], unique=False)
    op.create_index('ix_task_activities_task_created', 'task_activities', ['task_id', 'created_at', 'id'], unique=False)
    op.create_table('task_assignments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('assigned_user_id', sa.Integer(), nullable=False),
    sa.Column('assigned_by', sa.Integer(), nullable=False),
    sa.Column('assignment_status', sa.String(), server_default=sa.text("'active'"), nullable=False),
    sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("assignment_status IN ('active', 'cancelled')", name='ck_task_assignments_status'),
    sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['assigned_user_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_assignments_assigned_user_id', 'task_assignments', ['assigned_user_id'], unique=False)
    op.create_index('ix_task_assignments_task_id', 'task_assignments', ['task_id'], unique=False)
    op.create_index('uq_task_assignments_task_user', 'task_assignments', ['task_id', 'assigned_user_id'], unique=True)
    op.create_table('task_comments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_comments_task_created', 'task_comments', ['task_id', 'created_at', 'id'], unique=False)
    op.create_index('ix_task_comments_task_id', 'task_comments', ['task_id'], unique=False)
    op.create_table('task_label_assignments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('label_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['label_id'], ['task_labels.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_label_assignments_label_id', 'task_label_assignments', ['label_id'], unique=False)
    op.create_index('uq_task_label_assignments_task_label', 'task_label_assignments', ['task_id', 'label_id'], unique=True)


def downgrade() -> None:
    """Drop the task domain (activity history is destroyed too — it only
    survives task deletion, not table deletion)."""

    op.drop_index('uq_task_label_assignments_task_label', table_name='task_label_assignments')
    op.drop_index('ix_task_label_assignments_label_id', table_name='task_label_assignments')
    op.drop_table('task_label_assignments')
    op.drop_index('ix_task_comments_task_id', table_name='task_comments')
    op.drop_index('ix_task_comments_task_created', table_name='task_comments')
    op.drop_table('task_comments')
    op.drop_index('uq_task_assignments_task_user', table_name='task_assignments')
    op.drop_index('ix_task_assignments_task_id', table_name='task_assignments')
    op.drop_index('ix_task_assignments_assigned_user_id', table_name='task_assignments')
    op.drop_table('task_assignments')
    op.drop_index('ix_task_activities_task_created', table_name='task_activities')
    op.drop_index('ix_task_activities_actor_id', table_name='task_activities')
    op.drop_table('task_activities')
    op.drop_index('ix_tasks_parent_task_id', table_name='tasks')
    op.drop_index('ix_tasks_due_date', table_name='tasks')
    op.drop_index('ix_tasks_created_by_status', table_name='tasks')
    op.drop_index('ix_tasks_created_by', table_name='tasks')
    op.drop_table('tasks')
    op.drop_index('uq_task_labels_creator_name', table_name='task_labels')
    op.drop_index('ix_task_labels_created_by', table_name='task_labels')
    op.drop_table('task_labels')
