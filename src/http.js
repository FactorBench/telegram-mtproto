import axios from 'axios'

export const httpClient = axios.create()
// delete httpClient.defaults.headers.post['Content-Type'] // DO NOT delete to make it work on Android
delete httpClient.defaults.headers.common['Accept']

export default httpClient
