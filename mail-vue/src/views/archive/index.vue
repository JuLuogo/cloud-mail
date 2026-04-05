<template>
  <emailScroll type="archive" ref="scroll"
               :allow-star="true"
               :getEmailList="getArchiveList"
               :emailDelete="handleDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :email-archive="emailArchive"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
  />
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {archiveList, emailArchive, emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {useEmailStore} from "@/store/email.js";
import {defineOptions, onMounted, ref} from "vue";
import router from "@/router/index.js";

defineOptions({
  name: 'archive'
})

const scroll = ref({})
const emailStore = useEmailStore();

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/message')
}

function getArchiveList(emailId, size) {
  return archiveList({ emailId, size })
}

// 在归档页删除就是取消归档
function handleDelete(emailIds) {
  return emailArchive(emailIds)
}

onMounted(() => {
  emailStore.starScroll = scroll
})
</script>
