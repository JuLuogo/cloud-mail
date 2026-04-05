<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('twoFactorAuth')}}</div>
        <div>
          <el-tag v-if="twoFactorEnabled" type="success">{{$t('enabled')}}</el-tag>
          <el-tag v-else type="info">{{$t('disabled')}}</el-tag>
          <el-button type="primary" @click="openTwoFactorSetup" style="margin-left: 10px">
            {{ twoFactorEnabled ? $t('disable2FA') : $t('enable2FA') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 转发规则配置 -->
    <div class="forward-rules-section" v-if="hasForwardDomain">
      <div class="title">{{$t('forwardRules')}}</div>
      <div class="item">
        <div>{{$t('enable')}}</div>
        <div>
          <el-switch v-model="forwardEnabled" @change="toggleForward" />
        </div>
      </div>
      <div v-if="forwardEnabled" class="forward-rules-list">
        <div class="forward-rule-item" v-for="rule in forwardRules" :key="rule.ruleId">
          <span class="pattern">{{ rule.pattern }} → {{ rule.forwardTo }}</span>
          <span class="actions">
            <el-switch
              v-model="rule.status"
              :active-value="1"
              :inactive-value="0"
              @change="toggleRule(rule)"
            />
            <el-button size="small" @click="editRule(rule)">{{ $t('edit') }}</el-button>
            <el-button size="small" type="danger" @click="deleteRule(rule)">{{ $t('delete') }}</el-button>
          </span>
        </div>
        <el-button type="primary" @click="openAddRule" style="margin-top: 10px">
          <Icon icon="ion:add-outline" width="18" height="18"/>
          {{ $t('add') }}
        </el-button>
      </div>
    </div>

    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="twoFactorShow" :title="$t('twoFactorSetup')" width="400">
      <div class="two-factor-setup" v-if="!twoFactorEnabled">
        <div class="qrcode-container">
          <img v-if="qrCodeUrl" :src="qrCodeUrl" :alt="$t('scanQRCode')"/>
        </div>
        <p class="setup-tip">{{ $t('twoFactorSetupTip') }}</p>
        <el-input v-model="verifyCode" :placeholder="$t('enter6DigitCode')" maxlength="6" style="margin-bottom: 15px"/>
      </div>
      <div class="two-factor-disable" v-else>
        <p>{{ $t('twoFactorDisableTip') }}</p>
        <el-input v-model="disableCode" :placeholder="$t('enter6DigitCode')" maxlength="6" style="margin-bottom: 15px"/>
      </div>
      <template #footer>
        <el-button @click="twoFactorShow = false">{{$t('cancel')}}</el-button>
        <el-button type="primary" @click="submitTwoFactor" :loading="twoFactorLoading">
          {{ twoFactorEnabled ? $t('disable') : $t('enable') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 转发规则对话框 -->
    <el-dialog v-model="ruleDialog.show" :title="ruleDialog.isEdit ? $t('editRule') : $t('addRule')">
      <el-form :model="ruleDialog.form" label-width="100px">
        <el-form-item :label="$t('pattern')">
          <el-input v-model="ruleDialog.form.pattern" :placeholder="$t('patternPlaceholder')"/>
          <div class="form-tip">{{ $t('patternTip') }}</div>
        </el-form-item>
        <el-form-item :label="$t('forwardTo')">
          <el-input v-model="ruleDialog.form.forwardTo" :placeholder="$t('forwardToPlaceholder')"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialog.show = false">{{$t('cancel')}}</el-button>
        <el-button type="primary" @click="submitRule" :loading="ruleDialog.loading">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions, onMounted, computed} from 'vue'
import {resetPassword, userDelete} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {twoFactorSetup, twoFactorEnable, twoFactorDisable, twoFactorStatus} from "@/request/2fa.js";
import {forwardRuleList, forwardRuleAdd, forwardRuleUpdate, forwardRuleDelete, forwardRuleToggle} from "@/request/forward-rule.js";
import {userSetForwardStatus} from "@/request/user.js";
import {ElMessage, ElMessageBox} from "element-plus";
import {Icon} from "@iconify/vue";

const { t } = useI18n()
const accountStore = useAccountStore()
const userStore = useUserStore();

// 转发规则相关
const hasForwardDomain = ref(false) // 是否有可用域名权限
const forwardEnabled = computed({
  get: () => userStore.user.forwardStatus === 1,
  set: (val) => val
}) // 是否启用转发
const forwardRules = ref([])
const ruleDialog = reactive({
  show: false,
  isEdit: false,
  loading: false,
  form: {
    ruleId: null,
    pattern: '',
    forwardTo: ''
  }
})
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const twoFactorEnabled = ref(false)
const twoFactorShow = ref(false)
const twoFactorLoading = ref(false)
const qrCodeUrl = ref('')
const verifyCode = ref('')
const disableCode = ref('')
const currentSecret = ref('')

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

onMounted(async () => {
  try {
    const status = await twoFactorStatus()
    twoFactorEnabled.value = status.enabled
  } catch (e) {
    console.error('Failed to get 2FA status:', e)
  }
  loadForwardRules()
})

function openTwoFactorSetup() {
  if (twoFactorEnabled.value) {
    disableCode.value = ''
    twoFactorShow.value = true
  } else {
    qrCodeUrl.value = ''
    verifyCode.value = ''
    currentSecret.value = ''
    loadTwoFactorSetup()
    twoFactorShow.value = true
  }
}

async function loadTwoFactorSetup() {
  try {
    const data = await twoFactorSetup()
    qrCodeUrl.value = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(data.otpUrl)
    currentSecret.value = data.secret
  } catch (e) {
    console.error('Failed to load 2FA setup:', e)
  }
}

async function submitTwoFactor() {
  if (twoFactorEnabled.value) {
    if (!disableCode.value || disableCode.value.length !== 6) {
      ElMessage({
        message: t('invalidTwoFactorCodeMsg'),
        type: 'error',
        plain: true,
      })
      return
    }
    twoFactorLoading.value = true
    try {
      await twoFactorDisable({ code: disableCode.value })
      twoFactorEnabled.value = false
      twoFactorShow.value = false
      ElMessage({
        message: t('disable2FASuccessMsg'),
        type: 'success',
        plain: true,
      })
    } catch (e) {
      console.error('Failed to disable 2FA:', e)
    } finally {
      twoFactorLoading.value = false
    }
  } else {
    if (!verifyCode.value || verifyCode.value.length !== 6) {
      ElMessage({
        message: t('invalidTwoFactorCodeMsg'),
        type: 'error',
        plain: true,
      })
      return
    }
    twoFactorLoading.value = true
    try {
      await twoFactorEnable({ code: verifyCode.value, secret: currentSecret.value })
      twoFactorEnabled.value = true
      twoFactorShow.value = false
      ElMessage({
        message: t('enable2FASuccessMsg'),
        type: 'success',
        plain: true,
      })
    } catch (e) {
      console.error('Failed to enable 2FA:', e)
    } finally {
      twoFactorLoading.value = false
    }
  }
}

// 转发规则相关函数
async function loadForwardRules() {
  try {
    const rules = await forwardRuleList()
    forwardRules.value = rules
    // 用户登录后就显示转发规则区域，权限验证在后端进行
    hasForwardDomain.value = true
  } catch (e) {
    console.error('Failed to load forward rules:', e)
  }
}

function openAddRule() {
  ruleDialog.isEdit = false
  ruleDialog.form = {
    ruleId: null,
    pattern: '',
    forwardTo: ''
  }
  ruleDialog.show = true
}

function editRule(rule) {
  ruleDialog.isEdit = true
  ruleDialog.form = {
    ruleId: rule.ruleId || null,
    pattern: rule.pattern || '',
    forwardTo: rule.forwardTo || ''
  }
  ruleDialog.show = true
}

async function submitRule() {
  if (!ruleDialog.form.pattern || !ruleDialog.form.forwardTo) {
    ElMessage.warning(t('pleaseFillRequiredFields'))
    return
  }
  if (!ruleDialog.form.pattern.includes('@') || !ruleDialog.form.pattern.includes('*')) {
    ElMessage.warning(t('patternMustContainWildcard'))
    return
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(ruleDialog.form.forwardTo)) {
    ElMessage.warning(t('forwardToEmailInvalid'))
    return
  }
  ruleDialog.loading = true
  try {
    if (ruleDialog.isEdit) {
      await forwardRuleUpdate(ruleDialog.form)
    } else {
      await forwardRuleAdd(ruleDialog.form)
    }
    ruleDialog.show = false
    ElMessage.success(t('saveSuccessMsg'))
    loadForwardRules()
  } catch (e) {
    console.error('Failed to save forward rule:', e)
  } finally {
    ruleDialog.loading = false
  }
}

async function deleteRule(rule) {
  try {
    await ElMessageBox.confirm(t('deleteConfirm'), t('warning'), { type: 'warning' })
    await forwardRuleDelete(rule.ruleId)
    ElMessage.success(t('delSuccessMsg'))
    loadForwardRules()
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

async function toggleForward(val) {
  try {
    await userSetForwardStatus({ forwardStatus: val ? 1 : 0 })
    userStore.user.forwardStatus = val ? 1 : 0
    ElMessage.success(t('saveSuccessMsg'))
  } catch (e) {
    console.error('Failed to toggle forward:', e)
    // Revert the switch state
    userStore.user.forwardStatus = val ? 0 : 1
  }
}

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .two-factor-setup {
    text-align: center;
    .qrcode-container {
      margin-bottom: 15px;
      img {
        border: 1px solid var(--el-border-color);
        border-radius: 4px;
      }
    }
    .setup-tip {
      font-size: 13px;
      color: var(--el-text-color-secondary);
      margin-bottom: 15px;
    }
  }

  .two-factor-disable {
    text-align: center;
    p {
      margin-bottom: 15px;
      color: var(--el-text-color-secondary);
    }
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .forward-rules-section {
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid var(--el-border-color);

    .forward-rules-list {
      margin-top: 15px;
    }

    .forward-rule-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--el-border-color);

      .pattern {
        font-size: 14px;
      }

      .actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
    }

    .form-tip {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
  }
}
</style>
