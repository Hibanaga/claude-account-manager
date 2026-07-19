/** Base class for all expected, user-facing cam errors. */
export class CamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidProfileIdError extends CamError {
  constructor(id: string) {
    super(
      `Invalid profile name "${id}". Use 1-64 chars: lowercase letters, digits, "-" or "_", starting with a letter or digit.`,
    );
  }
}

export class ProfileNotFoundError extends CamError {
  constructor(id: string) {
    super(`No profile named "${id}". Run "cam list" to see profiles.`);
  }
}

export class ProfileExistsError extends CamError {
  constructor(id: string) {
    super(`Profile "${id}" already exists. Remove it first with "cam remove ${id}".`);
  }
}

export class NoActiveProfileError extends CamError {
  constructor() {
    super('No active profile. Run "cam use <name>" or "cam add <name>" first.');
  }
}

export class RunLockError extends CamError {
  constructor(pid: number) {
    super(`A "cam run" loop is already active (pid ${pid}).`);
  }
}

/** Thrown by providers/backends for capabilities deferred past the MVP. */
export class NotSupportedError extends CamError {}

export class InsecurePermissionsError extends CamError {}
