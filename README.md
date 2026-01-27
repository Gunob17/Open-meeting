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

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

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
└── package.json          # Root package.json
```
