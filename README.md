# Meeting Room Booking System

A comprehensive meeting room booking service for shared offices with a hierarchical user structure.

## Features

### User Hierarchy
- **Administrator**: Can create/delete meeting rooms, create all user types, manage companies
- **Company Admin**: Can create/delete users for their company
- **User**: Can book meeting rooms

### Core Features
- **Calendar View**: Weekly view showing all meeting rooms and their booking status
- **List View**: Shows rooms with capacity, amenities, and availability status
- **Booking System**: Book rooms with conflict detection
- **Email Notifications**: Meeting invites with ICS attachments sent to organizer and attendees

### Room Information
- Capacity (number of occupants)
- Amenities (projector, whiteboard, video conferencing, etc.)
- Floor and address information
- Availability status

## Tech Stack

### Backend
- Node.js with Express
- TypeScript
- SQLite (better-sqlite3)
- JWT authentication
- Nodemailer for emails
- ICS library for calendar invites

### Frontend
- React 18
- TypeScript
- React Router
- date-fns for date handling

## Getting Started

### Option 1: Docker (Recommended)

The easiest way to run the application is with Docker. Download the latest release from [GitHub Releases](../../releases):

```bash
# Download the image tar file from releases, then load it
gunzip -c meeting-booking-v1.0.0.tar.gz | docker load

# Run the container
docker run -d -p 80:80 --name meeting-booking meeting-booking:v1.0.0

# Or use Docker Compose (after building locally)
docker-compose up -d
```

The application will be available at `http://localhost`.

### Option 2: Local Development

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Installation

1. Install dependencies:
```bash
# Install all dependencies
npm run install:all

# Or install separately
npm run install:backend
npm run install:frontend
```

2. Seed the database with sample data:
```bash
npm run seed
```

3. Start the backend server:
```bash
npm run start:backend
```

4. In a new terminal, start the frontend:
```bash
npm run start:frontend
```

The backend will run on `http://localhost:3001` and frontend on `http://localhost:3000`.

## Demo Accounts

After seeding, you can log in with these accounts:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@sharedoffice.com | admin123 |
| Company Admin | admin@techcorp.com | techcorp123 |
| Company Admin | admin@startuphub.com | startup123 |
| User | john@techcorp.com | john123 |
| User | jane@techcorp.com | jane123 |
| User | bob@startuphub.com | bob123 |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Companies (Admin only)
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create company
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

### Users
- `GET /api/users` - List all users (Admin only)
- `GET /api/users/company/:companyId` - List company users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Meeting Rooms
- `GET /api/rooms` - List all rooms
- `GET /api/rooms/:id` - Get room details
- `GET /api/rooms/:id/availability` - Get room availability
- `POST /api/rooms` - Create room (Admin only)
- `PUT /api/rooms/:id` - Update room (Admin only)
- `DELETE /api/rooms/:id` - Delete room (Admin only)

### Bookings
- `GET /api/bookings` - List all bookings (with optional date range)
- `GET /api/bookings/my` - List current user's bookings
- `GET /api/bookings/:id` - Get booking details
- `POST /api/bookings` - Create booking
- `PUT /api/bookings/:id` - Update booking
- `POST /api/bookings/:id/cancel` - Cancel booking
- `DELETE /api/bookings/:id` - Delete booking

## Email Configuration

For production, configure these environment variables:

```bash
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
SMTP_FROM="Meeting Booking <noreply@yourcompany.com>"
```

## Project Structure

```
MeetingBooking/
├── backend/
│   ├── src/
│   │   ├── models/       # Database models
│   │   ├── routes/       # API routes
│   │   ├── middleware/   # Authentication middleware
│   │   ├── services/     # Email service
│   │   ├── types/        # TypeScript types
│   │   ├── index.ts      # Entry point
│   │   └── seed.ts       # Database seeding
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── context/      # React context (Auth)
│   │   ├── pages/        # Page components
│   │   ├── services/     # API service
│   │   ├── types/        # TypeScript types
│   │   ├── App.tsx       # Main app component
│   │   └── styles.css    # Global styles
│   └── package.json
├── docker/               # Docker configuration
│   ├── nginx.conf        # Nginx config for combined container
│   └── supervisord.conf  # Process manager config
├── .github/
│   └── workflows/
│       └── ci-cd.yml     # GitHub Actions CI/CD pipeline
├── Dockerfile            # Combined container (frontend + backend)
├── docker-compose.yml    # Production Docker Compose
├── docker-compose.dev.yml # Development with separate services
└── package.json          # Root package.json
```

## Docker

### Build Locally

```bash
# Build the combined image
docker build -t meeting-booking .

# Run the container
docker run -d -p 80:80 --name meeting-booking meeting-booking
```

### Docker Compose

```bash
# Production (combined container)
docker-compose up -d

# Development (separate backend and frontend)
docker-compose -f docker-compose.dev.yml up -d
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | (change in production!) |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | 587 |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASS` | SMTP password | - |
| `SMTP_FROM` | Email from address | Meeting Booking <noreply@meetingbooking.com> |

### Persistent Data

The SQLite database is stored in `/app/backend/data`. Mount a volume to persist data:

```bash
docker run -d -p 80:80 -v meeting-data:/app/backend/data meeting-booking
```

## CI/CD Pipeline

The project includes a GitHub Actions workflow that:

1. **Build & Test**: Compiles TypeScript for both backend and frontend
2. **Docker Build**: Creates Docker image and exports as tar archive
3. **Release**: Creates GitHub releases with the Docker image attached

### Creating a Release

#### Option 1: From GitHub UI (Recommended)

1. Go to the **Actions** tab in GitHub
2. Select **CI/CD Pipeline** from the workflows list
3. Click **Run workflow**
4. Enter the version (e.g., `v1.0.0`)
5. Optionally check "Mark as pre-release"
6. Click **Run workflow**

#### Option 2: From Terminal

```bash
# Tag a new version
git tag v1.0.0
git push origin v1.0.0
```

The CI/CD pipeline will automatically:
- Build the Docker image
- Export it as a compressed tar file (`meeting-booking-v1.0.0.tar.gz`)
- Create a GitHub release with changelog
- Attach the Docker image tar file to the release

### Using a Release

Download the `meeting-booking-vX.X.X.tar.gz` file from the release assets, then:

```bash
# Load the image into Docker
gunzip -c meeting-booking-v1.0.0.tar.gz | docker load

# Run the container
docker run -d -p 80:80 --name meeting-booking meeting-booking:v1.0.0
```
