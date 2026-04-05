import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}

export function emailArchive(emailId, isArchive) {
    if (isArchive) {
        return http.put('/email/archive', {emailId})
    } else {
        return http.put('/email/unarchive', {emailId})
    }
}

export function emailUnarchive(emailId) {
    return http.put('/email/unarchive', {emailId})
}

export function archiveList(params) {
    return http.get('/email/archiveList', {params})
}

export function emailSearch(params) {
    return http.get('/email/search', {params})
}