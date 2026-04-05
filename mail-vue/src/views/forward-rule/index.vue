<template>
  <div class="forward-rule-page">
    <div class="forward-rule-header">
      <span class="title">{{ $t('forwardRules') }}</span>
      <el-button type="primary" @click="openAdd">
        <Icon icon="ion:add-outline" width="18" height="18"/>
        {{ $t('add') }}
      </el-button>
    </div>

    <el-scrollbar class="forward-rule-scrollbar">
      <el-table :data="rules" style="width: 100%" v-loading="loading">
        <el-table-column prop="pattern" :label="$t('pattern')" width="200"/>
        <el-table-column prop="forwardTo" :label="$t('forwardTo')" width="200"/>
        <el-table-column prop="description" :label="$t('description')"/>
        <el-table-column prop="priority" :label="$t('priority')" width="80"/>
        <el-table-column prop="status" :label="$t('status')" width="100">
          <template #default="{ row }">
            <el-switch
                v-model="row.status"
                :active-value="1"
                :inactive-value="0"
                @change="toggleRule(row)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="$t('action')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">{{ $t('edit') }}</el-button>
            <el-button size="small" type="danger" @click="deleteRule(row)">{{ $t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="rules.length === 0 && !loading" :description="$t('noForwardRules')"/>
    </el-scrollbar>

    <el-dialog v-model="showDialog" :title="isEdit ? $t('editRule') : $t('addRule')">
      <el-form :model="form" label-width="100px">
        <el-form-item :label="$t('pattern')">
          <el-input v-model="form.pattern" :placeholder="$t('patternPlaceholder')"/>
          <div class="form-tip">{{ $t('patternTip') }}</div>
        </el-form-item>
        <el-form-item :label="$t('forwardTo')">
          <el-input v-model="form.forwardTo" :placeholder="$t('forwardToPlaceholder')"/>
        </el-form-item>
        <el-form-item :label="$t('description')">
          <el-input v-model="form.description" :placeholder="$t('enterDescription')"/>
        </el-form-item>
        <el-form-item :label="$t('priority')">
          <el-input-number v-model="form.priority" :min="0" :max="100"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" @click="submit" :loading="submitLoading">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, onMounted, reactive, ref} from "vue"
import {forwardRuleList, forwardRuleAdd, forwardRuleUpdate, forwardRuleDelete, forwardRuleToggle} from "@/request/forward-rule.js";
import {useI18n} from "vue-i18n";
import {ElMessage, ElMessageBox} from "element-plus";
import {Icon} from "@iconify/vue";

defineOptions({
  name: 'forward-rule'
})

const {t} = useI18n()

const rules = ref([])
const loading = ref(false)
const showDialog = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)

const form = reactive({
  ruleId: null,
  pattern: '',
  forwardTo: '',
  description: '',
  priority: 0,
  status: 1
})

onMounted(() => {
  loadRules()
})

async function loadRules() {
  loading.value = true
  try {
    rules.value = await forwardRuleList()
  } catch (e) {
    console.error('Failed to load forward rules:', e)
  } finally {
    loading.value = false
  }
}

function openAdd() {
  isEdit.value = false
  form.ruleId = null
  form.pattern = '*-99@99.com'
  form.forwardTo = ''
  form.description = ''
  form.priority = 0
  form.status = 1
  showDialog.value = true
}

function openEdit(rule) {
  isEdit.value = true
  Object.assign(form, rule)
  showDialog.value = true
}

async function submit() {
  if (!form.pattern || !form.forwardTo) {
    ElMessage.warning(t('pleaseFillRequiredFields'))
    return
  }

  if (!form.pattern.includes('@') || !form.pattern.includes('*')) {
    ElMessage.warning(t('patternMustContainWildcard'))
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(form.forwardTo)) {
    ElMessage.warning(t('forwardToEmailInvalid'))
    return
  }

  submitLoading.value = true
  try {
    if (isEdit.value) {
      await forwardRuleUpdate(form)
    } else {
      await forwardRuleAdd(form)
    }
    showDialog.value = false
    ElMessage.success(t('saveSuccessMsg'))
    loadRules()
  } catch (e) {
    console.error('Failed to save forward rule:', e)
    ElMessage.error(e?.message || t('saveFailedMsg') || 'Save failed')
  } finally {
    submitLoading.value = false
  }
}

async function deleteRule(rule) {
  try {
    await ElMessageBox.confirm(
        t('deleteConfirm'),
        t('warning'),
        { type: 'warning' }
    )
    await forwardRuleDelete(rule.ruleId)
    ElMessage.success(t('delSuccessMsg'))
    loadRules()
  } catch (e) {
    if (e !== 'cancel') {
      console.error('Failed to delete forward rule:', e)
    }
  }
}

async function toggleRule(rule) {
  try {
    await forwardRuleToggle({ ruleId: rule.ruleId, status: rule.status })
  } catch (e) {
    console.error('Failed to toggle forward rule:', e)
    rule.status = rule.status ? 0 : 1
  }
}
</script>

<style lang="scss" scoped>
.forward-rule-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.forward-rule-header {
  padding: 15px 20px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;

  .title {
    font-weight: bold;
    font-size: 16px;
  }
}

.forward-rule-scrollbar {
  flex: 1;
  overflow: hidden;
  padding: 15px 20px;
}

.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>