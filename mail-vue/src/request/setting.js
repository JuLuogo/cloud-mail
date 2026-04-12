import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set',setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}

export function cleanupTempFiles() {
    return http.post('/setting/cleanupTempFiles')
}

export function tempFileStats() {
    return http.get('/setting/tempFileStats')
}

export function cleanupRules() {
    return http.post('/setting/cleanupRules')
}

export function ruleStats() {
    return http.get('/setting/ruleStats')
}
