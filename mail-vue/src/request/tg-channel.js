import http from '@/axios/index.js';

export function getTgChannels() {
    return http.get('/tg/channels')
}

export function addTgChannel(channel) {
    return http.post('/tg/channels', channel)
}

export function updateTgChannel(id, channel) {
    return http.put(`/tg/channels/${id}`, channel)
}

export function deleteTgChannel(id) {
    return http.delete(`/tg/channels/${id}`)
}

export function testTgChannel(id) {
    return http.post(`/tg/channels/${id}/test`)
}
