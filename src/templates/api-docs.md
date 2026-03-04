# API Documentation

**Base URL:** `https://api.example.com/v1`
**Version:** 1.0
**Date:** {{DATE}}

## Authentication

All requests require an API key in the header:

```
Authorization: Bearer YOUR_API_KEY
```

## Endpoints

### Get All Resources

```
GET /resources
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page (default: 20) |

**Response:**

```json
{
  "data": [],
  "total": 0,
  "page": 1
}
```

### Get Resource by ID

```
GET /resources/:id
```

**Response:**

```json
{
  "id": "1",
  "name": "Resource name",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Create Resource

```
POST /resources
```

**Request Body:**

```json
{
  "name": "New resource",
  "description": "Description"
}
```

### Update Resource

```
PUT /resources/:id
```

### Delete Resource

```
DELETE /resources/:id
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 500 | Internal Server Error |
