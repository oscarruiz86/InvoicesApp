# Api Documentation Specification

## Purpose

Define how consumers and maintainers obtain an accurate, secure, and verifiable description of the REST API that is currently implemented. The capability covers API contracts and their publication, without changing business operations.

## Requirements

### Requirement: OpenAPI reflects implemented HTTP operations
The published OpenAPI document MUST use version 3.1.0 and describe each implemented public HTTP operation with its parameters, request body, responses, status codes, and applicable schemas.

#### Scenario: Implemented route is documented
- **WHEN** an implemented Route Handler is included in the API route inventory
- **THEN** its method and path appear in OpenAPI with the contract supported by its handler and presentation validation

#### Scenario: Proposed feature has no deployed route
- **WHEN** a feature appears only in OpenSpec proposals or archived design material and has no implemented handler
- **THEN** it is not represented as an available API operation

#### Scenario: Incomplete or conflicting contract is found
- **WHEN** implementation or approved specifications do not establish a request or response detail
- **THEN** documentation records the gap for resolution and does not invent the behavior

### Requirement: Contract maintenance is checked against implementation
The API contract MUST have a repeatable validation process that detects invalid OpenAPI and implemented HTTP methods or schemas that lack corresponding documentation.

#### Scenario: Contract validation succeeds
- **WHEN** maintainers run the documented contract validation command
- **THEN** structural OpenAPI validation runs and succeeds only when the document conforms to OpenAPI 3.1 rules

#### Scenario: Route lacks documentation
- **WHEN** a route coverage check finds an implemented method and path without an OpenAPI operation
- **THEN** validation fails and identifies the uncovered operation

#### Scenario: Documentation refers to a missing route
- **WHEN** a route coverage check finds a documented operation without an implemented or explicitly approved contract source
- **THEN** validation reports the stale operation for review

### Requirement: Request and response contracts preserve source constraints
Documented request and response schemas MUST preserve constraints from the implemented Zod validation, DTOs, and approved module contracts, including required fields, strictness, bounds, enums, and nullability when these are observable at the HTTP boundary.

#### Scenario: Zod contract changes
- **WHEN** a handler's accepted request changes
- **THEN** its OpenAPI request schema and examples are reviewed against the actual validator before the change is accepted

#### Scenario: Domain behavior is unspecified at transport boundary
- **WHEN** an application contract does not define an HTTP representation or status mapping
- **THEN** OpenAPI leaves the behavior unresolved and records it as a gap rather than deriving a response from domain error names

### Requirement: Authentication and endpoint access are described from current policy
Each operation MUST declare whether it is public or requires the implemented Bearer JWT authentication, and MUST document endpoint permission/context requirements only when established by current authorization policy or approved specifications.

#### Scenario: Public technical operation
- **WHEN** the operation is `/api/health`, `/api/docs`, or `/api/openapi`
- **THEN** it is documented as public and does not declare Bearer authentication

#### Scenario: Protected operation
- **WHEN** an operation is guarded by the current authenticated or authorized handler
- **THEN** OpenAPI declares HTTP Bearer JWT and describes only the permission and context requirements confirmed by implementation or approved contract

#### Scenario: Role or permission mapping is not established
- **WHEN** a route has an authorization guard but no approved endpoint-to-permission mapping
- **THEN** the contract does not invent a role or permission and records the missing mapping as an implementation decision

#### Scenario: Keycloak identity configuration
- **WHEN** authentication is described
- **THEN** the contract describes the verified JWT bearer boundary and does not publish issuer secrets, client credentials, tokens, or private Keycloak administration interfaces

### Requirement: Documentation publication is safe by environment
The OpenAPI document and Swagger interface MUST use the existing `/api/openapi` and `/api/docs` surfaces, remain consistent with the same contract, and avoid exposing secrets, private configuration, personal example data, or internal-only operations.

#### Scenario: Swagger displays published contract
- **WHEN** a user opens `/api/docs`
- **THEN** Swagger UI loads the contract served by `/api/openapi` and its locally available assets without sending authorization state to a third party

#### Scenario: Non-production publication policy
- **WHEN** the service is deployed in a non-development environment
- **THEN** the deployment policy explicitly determines whether docs UI and the machine-readable contract are enabled or access-controlled without changing business endpoint behavior

#### Scenario: Safe example is needed
- **WHEN** an example materially clarifies an operation
- **THEN** it uses minimal synthetic values and contains no credential, real identity, or sensitive personal data

### Requirement: Undocumented operations and incompatible contract changes are surfaced
Contract validation MUST make undocumented implemented operations visible for review, and changes that break an approved request or response contract MUST be identified before publication.

#### Scenario: Operation lacks contract
- **WHEN** a new implemented handler is introduced without an OpenAPI operation
- **THEN** the documented validation workflow fails before the contract is considered complete

#### Scenario: Incompatible schema change
- **WHEN** a proposed contract update removes or narrows an already approved request or response shape
- **THEN** review identifies the incompatible change and requires an explicit compatibility decision before publication
