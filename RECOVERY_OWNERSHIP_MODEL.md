# OnceHere ownership and recovery model

The creator's first Owner Master Recovery Key is the permanent root ownership credential for an archive.

Security invariants:

1. The original creator key must continue to authenticate for the lifetime of the archive unless the archive is permanently deleted by an authenticated owner or platform administrator.
2. Contributor/editor PIN holders must never be able to replace, revoke, rotate, reveal, or invalidate the creator's original key.
3. Optional secondary owner keys may be added or revoked only by an already authenticated owner. They are additional credentials, not replacements for the creator key.
4. The server stores only password hashes for recovery credentials. Plaintext keys are shown only at creation/issuance time and are never returned later by the API.
5. Changing contributor/editor/viewer PINs must not change ownership credentials.
6. A secondary owner cannot remove the creator's permanent key.
7. Existing owner sessions are authorization conveniences; ownership is ultimately recoverable with the permanent creator key.

This model prevents an editor or collaborator from taking over an archive by changing credentials while still allowing an owner to issue a separate backup/secondary owner key when needed.
