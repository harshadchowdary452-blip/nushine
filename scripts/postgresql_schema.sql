CREATE TYPE USERS_ROLE_ENUM AS ENUM ('SUPER_ADMIN', 'GROUP_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR');

CREATE TYPE PATIENTS_STATUS_ENUM AS ENUM ('NEW', 'ACTIVE', 'UNDER_TREATMENT', 'FOLLOW_UP', 'COMPLETED', 'INACTIVE');

CREATE TYPE APPOINTMENTS_STATUS_ENUM AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TYPE CASES_STATUS_ENUM AS ENUM ('NEW', 'DIAGNOSIS_PENDING', 'TREATMENT_PLANNED', 'IN_PROGRESS', 'FOLLOW_UP', 'COMPLETED', 'CANCELLED');

CREATE TYPE BILLINGS_PAYMENT_STATUS_ENUM AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'REFUNDED');

CREATE TYPE TREATMENT_PLANS_STATUS_ENUM AS ENUM ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'FOLLOW_UP', 'COMPLETED', 'CANCELLED');

CREATE TYPE TREATMENT_SITTINGS_STATUS_ENUM AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE treatment_sittings (
	id VARCHAR(36) NOT NULL, 
	treatment_plan_id VARCHAR(36) NOT NULL, 
	sitting_number INTEGER NOT NULL, 
	work_done TEXT, 
	status treatmentsittingstatus NOT NULL, 
	doctor_notes TEXT, 
	next_appointment_date DATE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(treatment_plan_id) REFERENCES treatment_plans (id)
);

CREATE TABLE payment_transactions (
	id VARCHAR(36) NOT NULL, 
	billing_id VARCHAR(36) NOT NULL, 
	amount FLOAT NOT NULL, 
	payment_method VARCHAR(50), 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(billing_id) REFERENCES billings (id)
);

CREATE TABLE treatment_plans (
	id VARCHAR(36) NOT NULL, 
	case_id VARCHAR(36) NOT NULL, 
	treatment_name VARCHAR(255) NOT NULL, 
	description TEXT, 
	cost FLOAT NOT NULL, 
	paid_amount FLOAT NOT NULL, 
	duration_minutes INTEGER, 
	start_date DATE, 
	expected_completion_date DATE, 
	status treatmentplanstatus NOT NULL, 
	notes TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id)
);

CREATE TABLE pre_ops (
	id VARCHAR(36) NOT NULL, 
	case_id VARCHAR(36) NOT NULL, 
	notes TEXT, 
	photo_urls TEXT, 
	xray_urls TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id)
);

CREATE TABLE post_ops (
	id VARCHAR(36) NOT NULL, 
	case_id VARCHAR(36) NOT NULL, 
	notes TEXT, 
	report TEXT, 
	photo_urls TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id)
);

CREATE TABLE patient_feedback (
	id VARCHAR(36) NOT NULL, 
	patient_id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36), 
	doctor_id VARCHAR(36), 
	case_id VARCHAR(36), 
	rating INTEGER NOT NULL, 
	review TEXT, 
	comments TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id)
);

CREATE TABLE follow_ups (
	id VARCHAR(36) NOT NULL, 
	patient_id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36), 
	doctor_id VARCHAR(36), 
	case_id VARCHAR(36), 
	appointment_id VARCHAR(36), 
	follow_up_date DATE NOT NULL, 
	follow_up_time TIME WITHOUT TIME ZONE, 
	notes TEXT, 
	status VARCHAR(20) NOT NULL, 
	reminder_sent BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id), 
	FOREIGN KEY(appointment_id) REFERENCES appointments (id)
);

CREATE TABLE consultant_notes (
	id VARCHAR(36) NOT NULL, 
	case_id VARCHAR(36) NOT NULL, 
	consultant_id VARCHAR(36) NOT NULL, 
	notes TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id), 
	FOREIGN KEY(consultant_id) REFERENCES consultants (id)
);

CREATE TABLE billings (
	id VARCHAR(36) NOT NULL, 
	case_id VARCHAR(36) NOT NULL, 
	total_amount FLOAT NOT NULL, 
	paid_amount FLOAT NOT NULL, 
	pending_amount FLOAT NOT NULL, 
	payment_status paymentstatus NOT NULL, 
	payment_method VARCHAR(50), 
	notes TEXT, 
	pdf_path VARCHAR(500), 
	invoice_number VARCHAR(50), 
	due_date DATE, 
	projected_amount FLOAT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(case_id) REFERENCES cases (id), 
	UNIQUE (invoice_number)
);

CREATE TABLE cases (
	id VARCHAR(36) NOT NULL, 
	patient_id VARCHAR(36) NOT NULL, 
	doctor_id VARCHAR(36), 
	consultant_id VARCHAR(36), 
	appointment_id VARCHAR(36), 
	chief_complaint TEXT NOT NULL, 
	diagnosis TEXT, 
	status casestatus NOT NULL, 
	notes TEXT, 
	completion_date TIMESTAMP WITH TIME ZONE, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id), 
	FOREIGN KEY(consultant_id) REFERENCES consultants (id), 
	FOREIGN KEY(appointment_id) REFERENCES appointments (id)
);

CREATE TABLE communication_logs (
	id VARCHAR(36) NOT NULL, 
	patient_id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36), 
	doctor_id VARCHAR(36), 
	channel VARCHAR(20) NOT NULL, 
	message_type VARCHAR(40) NOT NULL, 
	subject VARCHAR(255), 
	message TEXT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	provider_response TEXT, 
	sent_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	attachment_url VARCHAR(500), 
	PRIMARY KEY (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id)
);

CREATE TABLE appointments (
	id VARCHAR(36) NOT NULL, 
	patient_id VARCHAR(36) NOT NULL, 
	doctor_id VARCHAR(36) NOT NULL, 
	appointment_date DATE NOT NULL, 
	appointment_time TIME WITHOUT TIME ZONE NOT NULL, 
	status appointmentstatus NOT NULL, 
	notes TEXT, 
	is_active BOOLEAN NOT NULL, 
	reminder_sent BOOLEAN NOT NULL DEFAULT FALSE, 
	reminded_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id)
);

CREATE TABLE status_audit_logs (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	user_name VARCHAR(255), 
	user_role VARCHAR(40), 
	entity_type VARCHAR(50) NOT NULL, 
	entity_id VARCHAR(100) NOT NULL, 
	previous_status VARCHAR(50) NOT NULL, 
	new_status VARCHAR(50) NOT NULL, 
	reason TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE refresh_tokens (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	token_hash VARCHAR(500) NOT NULL, 
	is_revoked BOOLEAN NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	UNIQUE (token_hash)
);

CREATE TABLE patients (
	id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36) NOT NULL, 
	doctor_id VARCHAR(36), 
	full_name VARCHAR(255) NOT NULL, 
	gender VARCHAR(20), 
	date_of_birth DATE, 
	age INTEGER, 
	phone VARCHAR(50), 
	email VARCHAR(255), 
	address TEXT, 
	medical_history TEXT, 
	diagnosis TEXT, 
	photo_url VARCHAR(500), 
	status patientstatus NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id)
);

CREATE TABLE notifications (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36), 
	type VARCHAR(40) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	is_read BOOLEAN NOT NULL, 
	entity_type VARCHAR(40), 
	entity_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	read_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id)
);

CREATE TABLE hospital_monthly_expenses (
	id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36) NOT NULL, 
	expense_month INTEGER NOT NULL, 
	expense_year INTEGER NOT NULL, 
	expense_category VARCHAR(255) NOT NULL, 
	expense_name VARCHAR(255) NOT NULL, 
	description TEXT, 
	amount FLOAT NOT NULL, 
	created_by VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE TABLE audit_logs (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	action VARCHAR(255) NOT NULL, 
	entity_type VARCHAR(100) NOT NULL, 
	entity_id VARCHAR(100), 
	details TEXT, 
	ip_address VARCHAR(50), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36), 
	admin_group_id VARCHAR(36), 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	phone VARCHAR(50), 
	role role NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	specialization VARCHAR(255), 
	license_number VARCHAR(100), 
	is_verified BOOLEAN NOT NULL, 
	last_login TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id), 
	FOREIGN KEY(admin_group_id) REFERENCES admin_groups (id)
);

CREATE TABLE consultants (
	id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36) NOT NULL, 
	full_name VARCHAR(255) NOT NULL, 
	email VARCHAR(255), 
	phone VARCHAR(50), 
	specialization VARCHAR(255), 
	license_number VARCHAR(100), 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(hospital_id) REFERENCES hospitals (id)
);

CREATE TABLE hospitals (
	id VARCHAR(36) NOT NULL, 
	admin_group_id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	address TEXT, 
	phone VARCHAR(50), 
	email VARCHAR(255), 
	registration_number VARCHAR(100), 
	is_active BOOLEAN NOT NULL, 
	settings TEXT, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(admin_group_id) REFERENCES admin_groups (id)
);

CREATE TABLE hospital_settings (
	id VARCHAR(36) NOT NULL, 
	hospital_id VARCHAR(36) NOT NULL, 
	doctor_max_appointments_per_hour INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (hospital_id)
);

CREATE TABLE email_templates (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	subject VARCHAR(255) NOT NULL, 
	body TEXT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE admin_groups (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);
