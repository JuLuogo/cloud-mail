import http from '@/axios/index.js';

export function getTgChannels() {
    return http.get('/tg/channels/list')
}

export function addTgChannel(channel) {
    return http.post('/tg/channels/add', channel)
}

export function updateTgChannel(id, channel) {
    return http.post('/tg/channels/update', { ...channel, id })
}

export function deleteTgChannel(id) {
    return http.post('/tg/channels/delete', { id })
}

export function testTgChannel(id) {
    return http.post('/tg/channels/test', { id })
}
