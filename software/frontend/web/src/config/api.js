"use strict";
exports.__esModule = true;
exports.API_ENDPOINTS = exports.API_BASE_URL = void 0;
exports.API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8081';
exports.API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/auth/login',
        ADMIN_LOGIN: '/auth/admin/login',
        REGISTER: '/auth/register',
        VERIFY_EMAIL: '/auth/verify-email',
        RESEND_VERIFICATION: '/auth/resend-verification',
        ME: '/auth/me',
        CHANGE_PASSWORD: '/auth/change-password'
    },
    CONTROLLERS: {
        LIST: '/controllers',
        GET: function (id) { return "/controllers/".concat(id); },
        PAIR: '/controllers/pair',
        UPDATE: function (id) { return "/controllers/".concat(id); }
    },
    SENSORS: {
        LIST: function (controllerId) { return "/controllers/".concat(controllerId, "/sensors"); },
        GET: function (id) { return "/sensors/".concat(id); },
        UPDATE: function (id) { return "/sensors/".concat(id); },
        CONFIG: function (id) { return "/sensors/".concat(id, "/config"); }
    },
    DASHBOARD: {
        OVERVIEW: '/dashboard/overview',
        CONTROLLER: function (id) { return "/controllers/".concat(id, "/dashboard"); }
    },
    READINGS: {
        GET: function (sensorId) { return "/sensors/".concat(sensorId, "/readings"); }
    },
    ALERTS: {
        LIST: '/alerts',
        ACK: function (id) { return "/alerts/".concat(id, "/ack"); }
    },
    USERS: {
        LIST: '/users',
        CREATE_VIEWER: '/users/viewers'
    }
};
