CREATE TRIGGER platform_audit_log_no_update
BEFORE UPDATE ON platform_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'audit log is append-only';

CREATE TRIGGER platform_audit_log_no_delete
BEFORE DELETE ON platform_audit_log
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'audit log is append-only';