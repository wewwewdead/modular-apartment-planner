export class PersistenceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
  }
}

export class ProjectValidationError extends PersistenceError {
  constructor(message, errors = []) {
    super(message, 'VALIDATION_FAILED');
    this.name = 'ProjectValidationError';
    this.errors = errors;
  }
}

export class UnsupportedVersionError extends PersistenceError {
  constructor(version) {
    super(`Unsupported schema version: ${version}`, 'UNSUPPORTED_VERSION');
    this.name = 'UnsupportedVersionError';
    this.version = version;
  }
}

export class CorruptedDataError extends PersistenceError {
  constructor(message) {
    super(message || 'Project data is corrupted', 'CORRUPTED_DATA');
    this.name = 'CorruptedDataError';
  }
}
