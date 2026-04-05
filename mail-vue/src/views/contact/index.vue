<template>
  <div class="contact-page">
    <div class="contact-layout">
      <!-- 左侧分组列表 -->
      <div class="group-panel">
        <div class="group-header">
          <span>{{ $t('groups') }}</span>
          <Icon icon="ion:add-outline" width="20" height="20" @click="openAddGroup" class="add-icon"/>
        </div>
        <el-scrollbar>
          <div class="group-list">
            <div
                class="group-item"
                :class="{ active: selectedGroupId === null }"
                @click="selectGroup(null)"
            >
              <Icon icon="carbon:user-multiple" width="18" height="18"/>
              <span class="group-name">{{ $t('allContacts') }}</span>
              <span class="group-count">{{ total }}</span>
            </div>
            <div
                class="group-item"
                :class="{ active: selectedGroupId === 'star' }"
                @click="selectGroup('star')"
            >
              <Icon icon="solar:star-line-duotone" width="18" height="18"/>
              <span class="group-name">{{ $t('starred') }}</span>
            </div>
            <div
                v-for="group in groups"
                :key="group.groupId"
                class="group-item"
                :class="{ active: selectedGroupId === group.groupId }"
                @click="selectGroup(group.groupId)"
            >
              <div class="group-color" :style="{ backgroundColor: group.color }"></div>
              <span class="group-name">{{ group.name }}</span>
              <Icon
                  icon="fluent:settings-24-filled"
                  width="14"
                  height="14"
                  class="group-setting"
                  @click.stop="openEditGroup(group)"
              />
            </div>
          </div>
        </el-scrollbar>
      </div>

      <!-- 右侧联系人列表 -->
      <div class="contact-panel">
        <div class="contact-header">
          <div class="search-bar">
            <el-input
                v-model="params.keyword"
                :placeholder="$t('searchContact')"
                clearable
                @keyup.enter="search"
            >
              <template #prefix>
                <Icon icon="iconoir:search" width="16" height="16"/>
              </template>
            </el-input>
          </div>
          <Icon icon="ion:add-outline" width="24" height="24" @click="openAddContact" class="add-icon"/>
        </div>

        <el-scrollbar class="contact-scrollbar">
          <div class="contact-list" v-if="contacts.length > 0">
            <div
                v-for="contact in contacts"
                :key="contact.contactId"
                class="contact-item"
                @click="openEditContact(contact)"
            >
              <div class="contact-avatar">
                {{ getAvatarText(contact.name) }}
              </div>
              <div class="contact-info">
                <div class="contact-name">
                  <span>{{ contact.name }}</span>
                  <Icon
                      v-if="contact.isStar"
                      icon="solar:star-line-duotone"
                      width="14"
                      height="14"
                      class="star-icon"
                  />
                </div>
                <div class="contact-email">{{ contact.email }}</div>
                <div class="contact-company" v-if="contact.company">{{ contact.company }}</div>
              </div>
              <div class="contact-actions" @click.stop>
                <Icon
                    :icon="contact.isStar ? 'solar:star-bold' : 'solar:star-line-duotone'"
                    width="18"
                    height="18"
                    :class="{ starred: contact.isStar }"
                    @click="toggleStar(contact)"
                />
                <el-dropdown trigger="click">
                  <Icon icon="fluent:settings-24-filled" width="18" height="18"/>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="openEditContact(contact)">{{ $t('change') }}</el-dropdown-item>
                      <el-dropdown-item @click="deleteContact(contact)">{{ $t('delete') }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>
          <el-empty v-else :description="$t('noContactsFound')"/>
        </el-scrollbar>

        <div class="contact-pagination" v-if="total > 0">
          <el-pagination
              v-model:current-page="params.num"
              :page-size="params.size"
              :total="total"
              layout="prev, pager, next"
              @current-change="loadContacts"
          />
        </div>
      </div>
    </div>

    <!-- 添加/编辑联系人对话框 -->
    <el-dialog v-model="showContactDialog" :title="isEditContact ? $t('editContact') : $t('addContact')">
      <el-form :model="contactForm" label-width="80px">
        <el-form-item :label="$t('name')">
          <el-input v-model="contactForm.name"/>
        </el-form-item>
        <el-form-item :label="$t('email')">
          <el-input v-model="contactForm.email"/>
        </el-form-item>
        <el-form-item :label="$t('company')">
          <el-input v-model="contactForm.company"/>
        </el-form-item>
        <el-form-item :label="$t('phone')">
          <el-input v-model="contactForm.phone"/>
        </el-form-item>
        <el-form-item :label="$t('group')">
          <el-select v-model="contactForm.groupId" clearable :placeholder="$t('selectGroup')">
            <el-option v-for="group in groups" :key="group.groupId" :label="group.name" :value="group.groupId"/>
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('description')">
          <el-input v-model="contactForm.description" type="textarea" :rows="2"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showContactDialog = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" @click="submitContact" :loading="submitLoading">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑分组对话框 -->
    <el-dialog v-model="showGroupDialog" :title="isEditGroup ? $t('editGroup') : $t('addGroup')">
      <el-form :model="groupForm" label-width="80px">
        <el-form-item :label="$t('name')">
          <el-input v-model="groupForm.name"/>
        </el-form-item>
        <el-form-item :label="$t('color')">
          <el-color-picker v-model="groupForm.color"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGroupDialog = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" @click="submitGroup" :loading="submitLoading">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, onMounted, reactive, ref, watch} from "vue"
import {Icon} from "@iconify/vue";
import {contactList, contactAdd, contactUpdate, contactDelete, contactToggleStar, contactGroupList, contactGroupAdd, contactGroupUpdate, contactGroupDelete} from "@/request/contact.js";
import {useContactStore} from "@/store/contact.js";
import {useI18n} from "vue-i18n";
import {ElMessage} from "element-plus";

defineOptions({
  name: 'contact'
})

const {t} = useI18n()
const contactStore = useContactStore()

const params = reactive({
  keyword: '',
  num: 1,
  size: 20,
  groupId: null,
  isStar: 0
})

const contacts = ref([])
const total = ref(0)
const groups = ref([])
const selectedGroupId = ref(null)
const showContactDialog = ref(false)
const showGroupDialog = ref(false)
const isEditContact = ref(false)
const isEditGroup = ref(false)
const submitLoading = ref(false)

const contactForm = reactive({
  contactId: null,
  name: '',
  email: '',
  company: '',
  phone: '',
  groupId: null,
  description: ''
})

const groupForm = reactive({
  groupId: null,
  name: '',
  color: '#1890ff'
})

onMounted(() => {
  loadContacts()
  loadGroups()
})

watch(() => contactStore.refreshGroup, () => {
  loadGroups()
})

function selectGroup(groupId) {
  selectedGroupId.value = groupId
  params.num = 1
  if (groupId === 'star') {
    params.isStar = 1
    params.groupId = null
  } else {
    params.isStar = 0
    params.groupId = groupId
  }
  loadContacts()
}

async function loadContacts() {
  try {
    const data = await contactList(params)
    contacts.value = data.list
    total.value = data.total
  } catch (e) {
    console.error('Failed to load contacts:', e)
  }
}

async function loadGroups() {
  try {
    groups.value = await contactGroupList()
  } catch (e) {
    console.error('Failed to load groups:', e)
  }
}

function search() {
  params.num = 1
  loadContacts()
}

function openAddContact() {
  isEditContact.value = false
  Object.keys(contactForm).forEach(key => {
    if (key === 'groupId') contactForm[key] = selectedGroupId.value === 'star' ? null : selectedGroupId.value
    else contactForm[key] = ''
  })
  contactForm.groupId = selectedGroupId === 'star' ? null : selectedGroupId
  contactForm.contactId = null
  showContactDialog.value = true
}

function openEditContact(contact) {
  isEditContact.value = true
  Object.assign(contactForm, contact)
  showContactDialog.value = true
}

async function submitContact() {
  if (!contactForm.name || !contactForm.email) {
    ElMessage.warning(t('pleaseFillRequiredFields'))
    return
  }
  submitLoading.value = true
  try {
    if (isEditContact.value) {
      await contactUpdate(contactForm)
    } else {
      await contactAdd(contactForm)
    }
    showContactDialog.value = false
    ElMessage.success(t('saveSuccessMsg'))
    loadContacts()
  } catch (e) {
    console.error('Failed to save contact:', e)
  } finally {
    submitLoading.value = false
  }
}

async function deleteContact(contact) {
  try {
    await contactDelete(contact.contactId)
    ElMessage.success(t('delSuccessMsg'))
    loadContacts()
  } catch (e) {
    console.error('Failed to delete contact:', e)
  }
}

async function toggleStar(contact) {
  try {
    await contactToggleStar({
      contactId: contact.contactId,
      isStar: contact.isStar ? 0 : 1
    })
    loadContacts()
  } catch (e) {
    console.error('Failed to toggle star:', e)
  }
}

function openAddGroup() {
  isEditGroup.value = false
  groupForm.groupId = null
  groupForm.name = ''
  groupForm.color = '#1890ff'
  showGroupDialog.value = true
}

function openEditGroup(group) {
  isEditGroup.value = true
  Object.assign(groupForm, group)
  showGroupDialog.value = true
}

async function submitGroup() {
  if (!groupForm.name) {
    ElMessage.warning(t('pleaseFillRequiredFields'))
    return
  }
  submitLoading.value = true
  try {
    if (isEditGroup.value) {
      await contactGroupUpdate(groupForm)
    } else {
      await contactGroupAdd(groupForm)
    }
    showGroupDialog.value = false
    ElMessage.success(t('saveSuccessMsg'))
    loadGroups()
  } catch (e) {
    console.error('Failed to save group:', e)
  } finally {
    submitLoading.value = false
  }
}

async function deleteGroup(group) {
  try {
    await contactGroupDelete(group.groupId)
    ElMessage.success(t('delSuccessMsg'))
    if (selectedGroupId.value === group.groupId) {
      selectGroup(null)
    }
    loadGroups()
  } catch (e) {
    console.error('Failed to delete group:', e)
  }
}

function getAvatarText(name) {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}
</script>

<style lang="scss" scoped>
.contact-page {
  height: 100%;
  padding: 0;
}

.contact-layout {
  display: flex;
  height: 100%;
}

.group-panel {
  width: 220px;
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.group-header {
  padding: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  border-bottom: 1px solid var(--el-border-color);
}

.add-icon {
  cursor: pointer;
  color: var(--el-color-primary);
  &:hover {
    opacity: 0.8;
  }
}

.group-list {
  padding: 10px;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: all 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
}

.group-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  margin-right: 8px;
}

.group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}

.group-setting {
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;

  .group-item:hover & {
    opacity: 1;
  }
}

.contact-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.contact-header {
  padding: 15px;
  display: flex;
  align-items: center;
  gap: 15px;
  border-bottom: 1px solid var(--el-border-color);
}

.search-bar {
  flex: 1;
}

.contact-scrollbar {
  flex: 1;
  overflow: hidden;
}

.contact-list {
  padding: 10px;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  background: var(--el-fill-color-lighter);

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.contact-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  margin-right: 12px;
  flex-shrink: 0;
}

.contact-info {
  flex: 1;
  overflow: hidden;
}

.contact-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  margin-bottom: 4px;
}

.star-icon {
  color: var(--el-color-warning);
}

.contact-email {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-company {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 2px;
}

.contact-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.2s;

  .contact-item:hover & {
    opacity: 1;
  }
}

.starred {
  color: var(--el-color-warning);
}

.contact-pagination {
  padding: 15px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--el-border-color);
}
</style>
