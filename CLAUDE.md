# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server (Vite) on localhost:8080
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run lint` - Run ESLint to check code quality
- `npm run preview` - Preview production build locally

### Package Management
- `npm i` - Install dependencies

## Technology Stack

This is a React + TypeScript application built with:
- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Framework**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with custom gradients and animations
- **Database**: Supabase (PostgreSQL)
- **State Management**: React Query (@tanstack/react-query) for server state
- **Routing**: React Router DOM
- **PDF Generation**: jsPDF with autotable
- **Forms**: React Hook Form with Zod validation

## Architecture Overview

### Project Structure
- `src/pages/` - Main application pages (Index, Auth, Reports, OdooIntegration)
- `src/components/` - Reusable components organized by feature
  - `auth/` - Authentication components
  - `planning/` - Production planning components  
  - `reports/` - Reporting and analytics components
  - `ui/` - shadcn/ui base components
- `src/hooks/` - Custom React hooks for data fetching and auth
- `src/services/` - API services and data management
- `src/integrations/supabase/` - Supabase client and type definitions
- `supabase/` - Database migrations and Edge Functions

### Core Application Flow
The app has a sidebar navigation with multiple views:
1. **Dashboard** - Overview with quick actions and module cards
2. **Production Scheduler** - Visual production line scheduling
3. **Production Planner** - Drag-and-drop order planning with holiday management
4. **Reports** - Analytics and reporting module
5. **Odoo Integration** - External ERP system synchronization

### Database Schema
Key entities include:
- `orders` - Production orders with scheduling information
- `production_lines` - Manufacturing lines with capacity
- `holidays` - Holiday calendar with line-specific or global scope
- `purchases` - Purchase orders and holds from Odoo
- `inventory` - Stock levels and product information
- `profiles` - User management with role-based access

### Authentication
- Supabase Auth with email/password
- Role-based access (superuser, planner)
- Protected routes with authentication guards

## Key Features

### Production Planning
- Drag-and-drop order scheduling to production lines
- Holiday management (global and line-specific)
- Production line grouping and capacity management
- Split order functionality
- Automatic holiday-aware rescheduling

### Reporting System
- Sales targets and analytics
- Inventory reports with low stock alerts
- Production planning reports
- PDF export capabilities
- Interactive charts with Recharts

### Odoo Integration
- Real-time synchronization via Supabase Edge Functions
- Purchase order management
- Inventory synchronization
- Invoice processing

## Development Guidelines

### Component Patterns
- Use functional components with TypeScript
- Implement custom hooks for data logic
- Follow shadcn/ui component patterns
- Use React Query for all server state management

### Database Operations
- All database operations go through Supabase services
- Use TypeScript types from `src/integrations/supabase/types.ts`
- Follow Row Level Security (RLS) patterns
- Prefer bulk operations for performance

### Styling
- Use Tailwind CSS with custom utility classes
- Implement consistent gradient patterns for visual hierarchy
- Follow responsive design principles
- Use CSS animations for enhanced UX

### State Management
- React Query for server state and caching
- Local state with useState/useReducer for UI state
- Context providers for auth and global state
- Optimistic updates where appropriate

## Common Workflows

### Adding New Features
1. Create components in appropriate feature directory
2. Add database types if new tables/columns needed
3. Implement data services with proper error handling
4. Add routing if new pages required
5. Update type definitions and schemas

### Database Changes
1. Create migration files in `supabase/migrations/`
2. Update TypeScript types in `src/integrations/supabase/types.ts`
3. Test locally before deploying
4. Update related services and components

### Supabase Edge Functions
Located in `supabase/functions/` for:
- Odoo API integration
- Scheduled data synchronization
- External webhook handling