<template>
  <div class="modal-backdrop show" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <BaseModalShell
      tag="form"
      class="modal"
      :class="{ 'modal-sop': isSopFlow, 'modal-token-flow': isTokenFlow || isRemoteBatchFlow }"
      @submit.prevent="submit"
    >
      <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge" :class="actionBadgeClass">
            <span v-html="actionIcon"></span>
          </div>
          <h2 class="modal-title">{{ modalHeading }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
      </template>
      <div v-if="isSopFlow" class="sop-stepper">
        <div class="sop-step" :class="{ active: sopStep === 1, done: sopStep > 1 }">
          <div class="sop-step-dot"><span v-if="sopStep > 1">&#10003;</span><span v-else>1</span></div>
          <span>Details</span>
        </div>
        <div class="sop-step-line" :class="{ done: sopStep > 1 }"></div>
        <div class="sop-step" :class="{ active: sopStep === 2 }">
          <div class="sop-step-dot">2</div>
          <span>Review</span>
        </div>
      </div>
      <div v-if="isTokenFlow" class="token-stepper" aria-label="Token progress">
        <div v-for="step in tokenSteps" :key="step.id" class="token-step" :class="{ active: tokenStepState === step.id, done: tokenStepDone(step.id) }">
          <span class="token-step-dot">
            <span v-if="tokenStepDone(step.id)">&#10003;</span>
            <span v-else>{{ step.number }}</span>
          </span>
          <span>{{ step.label }}</span>
        </div>
      </div>
      <div v-else-if="isRemoteBatchFlow" class="token-stepper" aria-label="Batch task progress">
        <div v-for="step in remoteBatchSteps" :key="step.id" class="token-step" :class="{ active: remoteBatchStep === step.id, done: remoteBatchStepDone(step.id) }">
          <span class="token-step-dot">
            <span v-if="remoteBatchStepDone(step.id)">&#10003;</span>
            <span v-else>{{ step.number }}</span>
          </span>
          <span>{{ step.label }}</span>
        </div>
      </div>
      <div class="modal-body">
        <p v-if="simpleBody && action !== 'Print'">{{ simpleBody }}</p>
        <div v-if="isRemoteTaskFlow" class="token-flow">
          <template v-if="isRemoteBatchFlow && remoteBatchStep === 'review'">
            <div class="modal-grid">
              <label class="modal-field">
                <span>Selected Meter</span>
                <BaseInput :value="String(remoteBatchSelectedMeterCount)" readonly />
              </label>
              <label class="modal-field">
                <span>Station Count</span>
                <BaseInput :value="String(remoteBatchStationCount)" readonly />
              </label>
              <label class="modal-field modal-span-two">
                <span>Data Item</span>
                <BaseInput :value="remoteBatchSelectedDataItems.join(', ')" readonly />
              </label>
            </div>
            <section class="batch-task-preview" aria-label="Selected meters preview">
              <div class="batch-task-preview-head">
                <div>
                  <span class="batch-task-eyebrow">Batch preview</span>
                  <strong>{{ remoteBatchSummaryText }}</strong>
                </div>
                <span class="batch-task-badge">{{ remoteBatchSelectedMeterCount }} meters</span>
              </div>
              <div class="batch-task-list">
                <article v-for="row in remoteBatchPreviewRows" :key="`${row.meterId}-${row.customerId || row.customerName || row.stationId}`" class="batch-task-card">
                  <span>{{ row.stationId || 'No station' }}</span>
                  <strong>{{ row.customerName || row.customerId || row.meterId }}</strong>
                  <small>{{ row.meterId }}</small>
                </article>
              </div>
              <p class="token-helper">{{ remoteBatchSelectedDataItemsLabel }}</p>
              <p v-if="remoteBatchOverflowCount > 0" class="token-helper">{{ remoteBatchOverflowCount }} more meter{{ remoteBatchOverflowCount === 1 ? '' : 's' }} selected.</p>
            </section>
          </template>
          <!-- BATCH READING: Form step — grouped data item checkboxes -->
          <template v-else-if="isRemoteBatchReadingFlow && remoteBatchStep === 'form'">
            <div class="batch-meter-summary">
              <div class="batch-meter-summary-icon">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
              </div>
              <div>
                <strong>{{ remoteBatchSelectedMeterCount }} meter{{ remoteBatchSelectedMeterCount === 1 ? '' : 's' }} selected</strong>
                <span>{{ remoteBatchStationCount }} station{{ remoteBatchStationCount === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <div class="batch-data-picker">
              <label class="batch-data-picker-label">Data Item</label>
              <BaseInput v-model="dataItemFilter" class="batch-data-filter" placeholder="Enter keywords to filter" autocomplete="off" />
              <div v-for="group in filteredDataItemGroups" :key="group.group" class="batch-data-group">
                <label class="batch-data-group-header" @click.prevent="toggleDataItemGroup(group)">
                  <span class="batch-data-group-check" :class="{ checked: isDataItemGroupChecked(group), partial: isDataItemGroupPartial(group) }">
                    <svg v-if="isDataItemGroupChecked(group)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    <svg v-else-if="isDataItemGroupPartial(group)" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
                  </span>
                  <span class="batch-data-group-name">{{ group.group }}</span>
                </label>
                <div class="batch-data-items">
                  <label v-for="item in group.items" :key="item.value" class="batch-data-item" :class="{ checked: isDataItemSelected(item.value) }" @click.prevent="toggleDataItem(item.value)">
                    <span class="batch-data-item-check" :class="{ checked: isDataItemSelected(item.value) }">
                      <svg v-if="isDataItemSelected(item.value)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </span>
                    <span>{{ item.label }}</span>
                  </label>
                </div>
              </div>
            </div>
          </template>
          <!-- SINGLE TASK or LEGACY BATCH (non-reading) -->
          <div v-else class="modal-grid">
            <label v-if="!isRemoteBatchFlow" class="modal-field">
              <span>Customer Id</span>
              <BaseInput v-model="form.customerId" :readonly="!remoteTaskAllowsManualEntry" />
            </label>
            <label v-if="!isRemoteBatchFlow" class="modal-field">
              <span>Customer Name</span>
              <BaseInput v-model="form.customerName" :readonly="!remoteTaskAllowsManualEntry" />
            </label>
            <label v-if="!isRemoteBatchFlow" class="modal-field">
              <span>Meter Id</span>
              <BaseInput v-model="form.meterId" :readonly="!remoteTaskAllowsManualEntry" />
            </label>
            <label v-if="isRemoteSupportTaskRoute" class="modal-field">
              <span>Protocol Version</span>
              <BaseInput v-model="form.protocolVersion" autocomplete="off" />
            </label>
            <label v-if="!isRemoteBatchFlow" class="modal-field">
              <span>Station Id</span>
              <BaseInput v-model="form.stationId" :readonly="!remoteTaskAllowsManualEntry" />
            </label>
            <label v-if="!isRemoteBatchFlow" class="modal-field">
              <span>Data Item</span>
              <BaseSelect v-model="form.dataItem">
                <option v-for="option in remoteDataOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </BaseSelect>
            </label>
            <label v-if="isRemoteBatchFlow" class="modal-field modal-span-two">
              <span>Meter Id</span>
              <BaseSelect v-model="form.selectedMeterIds" multiple size="8">
                <option v-for="option in remoteBatchMeterOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </BaseSelect>
            </label>
            <label v-if="isRemoteBatchFlow" class="modal-field modal-span-two">
              <span>Data Item</span>
              <BaseSelect v-model="form.selectedDataItems" multiple :size="remoteDataOptions.length">
                <option v-for="option in remoteDataOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </BaseSelect>
            </label>
            <label v-if="isRemoteTokenTask" class="modal-field">
              <span>Token</span>
              <BaseInput v-model="form.token" autocomplete="off" />
            </label>
            <label v-if="remoteTaskRequiresAuthorization" class="modal-field">
              <span>Authorization Password</span>
              <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
            </label>
          </div>
          <p v-if="action === 'Add Batch Task'" class="token-helper">Batch rows: {{ remoteBatchCount }}</p>
        </div>
        <div v-else-if="isTokenFlow" class="token-flow" :class="{ 'token-flow-enterprise': isCreditToken && tokenStep === 'confirm', 'token-flow-final': Boolean(tokenFinal) }">
          <div v-if="tokenFinal" class="token-final-panel">
            <div class="token-final-hero">
              <div class="token-final-icon" :class="{ failed: tokenFinalFailed }">
                <svg v-if="tokenFinalFailed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
              </div>
              <div>
                <h3>{{ tokenFinalFailed ? 'Token failed' : 'Token generated' }}</h3>
                <p>{{ tokenFinalFailed ? tokenFinalMessage : 'Receipt opened and record is ready.' }}</p>
              </div>
            </div>
            <div v-if="finalTokenValue" class="token-vault">
              <div class="token-vault-content">
                <span>Token</span>
                <strong>{{ finalTokenValue }}</strong>
              </div>
              <div class="token-send-action">
                <BaseButton 
                  v-if="!tokenSentStatus" 
                  size="sm" 
                  variant="primary" 
                  :disabled="tokenSendLoading" 
                  @click.prevent="sendTokenToMeter"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                  {{ tokenSendLoading ? 'Sending...' : 'Send to Meter' }}
                </BaseButton>
                <div v-else-if="tokenSentStatus === 'success'" class="token-sent-success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  Sent to meter
                </div>
                <div v-else-if="tokenSentStatus === 'error'" class="token-sent-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Send failed
                  <BaseButton size="sm" variant="quiet" @click.prevent="sendTokenToMeter">Retry</BaseButton>
                </div>
              </div>
            </div>
            <div class="token-final-grid">
              <div v-for="field in tokenFinalFields" :key="field[0]" class="token-final-row">
                <span>{{ field[0] }}</span>
                <strong>{{ field[1] }}</strong>
              </div>
            </div>
          </div>
          <div v-else-if="isCreditToken && tokenStep === 'confirm'" class="token-confirmation enterprise-confirmation">
            <section class="token-review-hero" aria-label="Transaction confirmation details">
              <div class="token-review-title">
                <span>Review</span>
                <strong>{{ form.customerName || form.customerId }}</strong>
              </div>
              <div class="token-review-amount">
                <span>Total Paid</span>
                <strong>{{ formattedTokenAmount }}</strong>
              </div>
            </section>
            <section class="token-review-grid">
              <div v-for="field in creditConfirmationFields" :key="`${field[0]}-reference-row`" class="token-review-card" :class="{ total: field[0] === 'Total Paid(MMK)' }">
                <span>{{ field[0] }}</span>
                <strong>{{ field[1] }}</strong>
              </div>
            </section>
            <section class="enterprise-approval token-approval" aria-label="Approval controls">
              <label class="modal-field enterprise-field">
                <span>Payment Method</span>
                <BaseSelect v-model="form.paymentMethod">
                  <option v-for="method in paymentMethods" :key="method" :value="method">{{ method }}</option>
                </BaseSelect>
              </label>
              <label class="modal-field enterprise-field">
                <span>Authorization Password</span>
                <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" placeholder="Required for live write" />
              </label>
              <div class="enterprise-approval-note">
                <strong>Approval required</strong>
                <span>Confirm payment, then generate the token.</span>
              </div>
            </section>
          </div>
          <div v-else class="modal-grid">
            <div class="token-customer-card modal-span-two">
              <div>
                <span>Selected customer</span>
                <strong>{{ form.customerName || form.customerId || 'No customer selected' }}</strong>
              </div>
              <div>
                <span>Meter</span>
                <strong>{{ form.meterId || 'No meter' }}</strong>
              </div>
              <div>
                <span>Tariff</span>
                <strong>{{ form.tariffId || 'No tariff' }}</strong>
              </div>
            </div>
            <label class="modal-field">
              <span>Customer Id</span>
              <BaseInput v-model="form.customerId" readonly />
            </label>
            <label class="modal-field">
              <span>Customer Name</span>
              <BaseInput v-model="form.customerName" readonly />
            </label>
            <label class="modal-field">
              <span>Meter Id</span>
              <BaseInput v-model="form.meterId" readonly />
            </label>
            <label class="modal-field">
              <span>Tariff Id</span>
              <BaseInput v-model="form.tariffId" readonly />
            </label>
            <template v-if="isCreditToken">
              <label class="modal-field">
                <span>Debt Percent</span>
                <BaseSelect v-model="form.payDebtPercent">
                  <option v-for="value in debtPercents" :key="value" :value="value">{{ value }}</option>
                </BaseSelect>
              </label>
              <label class="modal-field">
                <span>Purchase Way</span>
                <BaseSelect v-model="form.purchaseWay">
                  <option v-for="option in purchaseWays" :key="option.value" :value="option.value">{{ option.label }}</option>
                </BaseSelect>
              </label>
              <label class="modal-field">
                <span>Total Paid(MMK)</span>
                <BaseInput v-model="form.amount" type="number" min="0" step="0.01" :readonly="form.purchaseWay === 'unit'" />
              </label>
              <label class="modal-field">
                <span>Total Unit(kWh)</span>
                <BaseInput v-model="form.totalUnit" type="number" min="0" step="0.1" :readonly="form.purchaseWay !== 'unit'" />
              </label>
            </template>
            <template v-else>
              <label v-if="isMaximumPowerToken" class="modal-field">
                <span>Maximum Power(W)</span>
                <BaseInput v-model="form.maximumPower" type="number" min="0" step="1" />
              </label>
              <label v-if="!isSimpleTokenRoute" class="modal-field" :class="{ 'modal-span-two': !isMaximumPowerToken }">
                <span>Remark</span>
                <BaseInput v-model="form.remark" autocomplete="off" />
              </label>
            </template>
            <label v-if="!isCreditToken && !isSimpleTokenRoute" class="modal-field">
              <span>Authorization Password</span>
              <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
            </label>
          </div>
          <div v-if="isCreditToken && tokenPriceText && !tokenFinal" class="token-rate-card">
            <span>{{ tokenPriceText }}</span>
            <strong>{{ tokenActionError || 'Ready' }}</strong>
          </div>
        </div>
        <div v-else-if="action === 'Import'" class="modal-grid">
          <label class="modal-field modal-span-two">
            <span>{{ uploadMode ? "Upload File" : "Import File" }}</span>
            <input type="file" :accept="fileAccept" @change="handleImportFile">
          </label>
          <label v-if="showAuthorizationField" class="modal-field modal-span-two">
            <span>Authorization Password</span>
            <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
          </label>
        </div>
        <div v-else-if="isSopFlow && sopStep === 2" class="sop-review">
          <div class="sop-review-title">Review your details</div>
          <div class="sop-review-grid">
            <div v-for="field in fields" :key="field.name" class="sop-review-row">
              <span class="sop-review-label">{{ field.label }}</span>
              <span class="sop-review-value">{{ field.type === 'password' ? '••••••••' : (form[field.name] || '—') }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="action !== 'Print'" class="modal-grid">
          <div v-for="field in fields" :key="field.name" class="modal-field" :class="{ 'modal-field-full': field.name === 'remark' || field.type === 'password' || field.type === 'permissions' }">
            <span class="modal-field-label">
              <em v-if="field.required" class="req-star">*</em>{{ field.label }}
            </span>
            <!-- Station select -->
            <BaseSelect v-if="field.type === 'select'" v-model="form[field.name]" :name="field.name">
              <option value="">Please Select</option>
              <option v-for="option in fieldOptions(field)" :key="option.value" :value="option.value">{{ option.label }}</option>
            </BaseSelect>
            <!-- Role select (live from API) -->
            <BaseSelect v-else-if="field.type === 'role-select'" v-model="form[field.name]" :name="field.name">
              <option value="">{{ rolesLoading ? 'Loading roles...' : 'Select Role' }}</option>
              <option v-for="r in roles" :key="r.value" :value="r.value">{{ r.label }}</option>
            </BaseSelect>
            <!-- Permissions multi-select picker -->
            <div v-else-if="field.type === 'permissions'" class="perm-picker-wrap">
              <div class="perm-trigger" @click="permOpen = !permOpen">
                <span class="perm-trigger-label">
                  <span v-if="permSelectedCount === 0" class="perm-placeholder">Click to select permissions…</span>
                  <span v-else class="perm-count-badge">{{ permSelectedCount }} selected</span>
                </span>
                <svg class="perm-chevron" :class="{ open: permOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <!-- Selected tags strip -->
              <div v-if="permSelectedCount" class="perm-tags">
                <span v-for="val in permissionsSelected" :key="val" class="perm-tag">
                  {{ val.split('.')[1] || val }}
                  <BaseIconButton class="perm-tag-del" aria-label="Remove permission" @click.stop="togglePerm(val)">&times;</BaseIconButton>
                </span>
              </div>
              <!-- Dropdown panel -->
              <div v-show="permOpen" class="perm-panel">
                <div class="perm-panel-header">
                  <span class="perm-count-info">{{ permSelectedCount }} / {{ rolePermissions.flatMap(g => g.items).length }} selected</span>
                  <div class="perm-panel-actions">
                    <BaseButton class="perm-link" size="sm" variant="ghost" @click="selectAllPerms">All</BaseButton>
                    <BaseButton class="perm-link danger" size="sm" variant="danger" @click="clearPerms">Clear</BaseButton>
                  </div>
                </div>
                <div class="perm-groups">
                  <div v-for="group in rolePermissions" :key="group.group" class="perm-group">
                    <div class="perm-group-label">{{ group.group }}</div>
                    <div class="perm-items">
                      <label v-for="item in group.items" :key="item.value" class="perm-item" :class="{ checked: isPermSelected(item.value) }" @click.prevent="togglePerm(item.value)">
                        <span class="perm-check" :class="{ checked: isPermSelected(item.value) }">
                          <svg v-if="isPermSelected(item.value)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        </span>
                        {{ item.label }}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Password with strength meter -->
            <div v-else-if="field.type === 'password'" class="pw-field-wrap">
              <div class="pw-input-row">
                <BaseInput
                  v-model="form[field.name]"
                  :type="showPwField ? 'text' : 'password'"
                  :name="field.name"
                  autocomplete="new-password"
                  placeholder="Min 8 characters"
                  class="pw-input"
                />
                <BaseIconButton class="pw-eye" aria-label="Toggle password visibility" @click="showPwField = !showPwField">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </BaseIconButton>
              </div>
              <div class="pw-strength-row" v-if="form[field.name]">
                <div class="pw-bars">
                  <div v-for="i in 4" :key="i" class="pw-bar" :class="{ filled: pwStrength >= i, strong: pwStrength === 4, medium: pwStrength === 3 }"></div>
                </div>
                <span class="pw-strength-label">{{ pwLabel }}</span>
              </div>
            </div>
            <!-- Picker -->
            <div v-else-if="field.picker" class="modal-input-group">
              <BaseInput v-model="form[field.name]" :name="field.name" autocomplete="off" :readonly="true" class="input-readonly" />
              <BaseButton class="modal-picker-btn" size="sm" @click="handlePicker(field)">...</BaseButton>
            </div>
            <!-- Default text input -->
            <BaseInput v-else v-model="form[field.name]" :name="field.name" :readonly="field.readonly" :class="{ 'input-readonly': field.readonly }" autocomplete="off" />
          </div>
          <label v-if="action === 'Delete'" class="modal-field modal-span-two">
            <span>Delete Confirmation</span>
            <BaseCheckbox v-model="form.confirmDelete">Confirm deletion</BaseCheckbox>
          </label>
        <label v-if="showAuthorizationField" class="modal-field">
          <span>Authorization Password</span>
            <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
        </label>
        </div>
        <p v-if="writeAction && !isTokenFlow && !isRemoteTaskFlow && action !== 'Print'" class="modal-confirmation">{{ form.confirmationText }}</p>

        <div v-if="action === 'Print'" class="receipt-preview">
          <div class="receipt-preview-container">

            <div class="receipt-card-premium">
              <div class="receipt-header">
                <div class="receipt-brand">
                  <div class="brand-mark">B</div>
                  <span class="brand-name">Beverly</span>
                </div>
                <h3 class="receipt-title">{{ receiptModel.title }}</h3>
                <p class="receipt-subtitle">{{ receiptModel.subtitle }}</p>
              </div>

              <div class="receipt-amount">
                <span class="amount-label">Amount Purchased</span>
                <span class="amount-value">{{ receiptModel.amount }}</span>
              </div>

              <div v-if="receiptModel.fields.find(f => f.isToken)" class="receipt-token-box">
                <span class="token-label">Your Token</span>
                <div class="token-value">{{ receiptModel.fields.find(f => f.isToken).value }}</div>
              </div>

              <div class="receipt-footer-branding">
                <span class="company-name">{{ receiptModel.brand.company }}</span>
                <div class="contact-line">{{ receiptModel.brand.email }} &bull; {{ receiptModel.brand.phone }}</div>
                <div class="contact-line">{{ receiptModel.brand.web }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="importPreview" class="modal-result">{{ importPreview }}</div>
        <div v-if="error" class="modal-error">{{ error }}</div>
        <div v-if="result" class="modal-result">{{ result }}</div>
      </div>

      <template #footer>
      <div class="modal-actions">
        <BaseButton @click="isRemoteBatchFlow && remoteBatchStep === 'review' ? remoteBatchStep = 'form' : (isSopFlow && sopStep === 2 ? sopStep = 1 : $emit('close'))">
          {{ isRemoteBatchFlow && remoteBatchStep === 'review' ? 'Back' : (isSopFlow && sopStep === 2 ? 'Back' : 'Cancel') }}
        </BaseButton>
        <template v-if="action === 'Print'">
          <BaseButton @click="downloadPdf">
            <svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372zm128-448c0-4.4-3.6-8-8-8h-88v-120c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v120h-88c-4.4 0-8 3.6-8 8s3.6 8 8 8h88v120c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8v-120h88c4.4 0 8-3.6 8-8z"></path></svg>
            PDF Export
          </BaseButton>
          <BaseButton variant="primary" @click="printReceipt">
            <svg class="svg-icon" viewBox="0 0 1024 1024"><path d="M820 436h-40V312c0-8.8-7.2-16-16-16H260c-8.8 0-16 7.2-16 16v124h-40c-17.7 0-32 14.3-32 32v240c0 17.7 14.3 32 32 32h40v124c0 8.8 7.2 16 16 16h504c8.8 0 16-7.2 16-16V740h40c17.7 0 32-14.3 32-32V468c0-17.7-14.3-32-32-32zM308 360h408v76H308v-76zm408 536H308V684h408v212zM808 612c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24z"></path></svg>
            Browser Print
          </BaseButton>
        </template>
        <template v-else-if="isRemoteTaskFlow">
          <BaseButton v-if="isRemoteBatchFlow && remoteBatchStep === 'form'" variant="primary" :disabled="tokenLoading || Boolean(remoteTaskFormError)" @click="advanceRemoteBatchStep">Review</BaseButton>
          <BaseButton v-else variant="primary" :disabled="tokenLoading || Boolean(remoteTaskFormError)" @click="confirmRemoteTask">Confirm</BaseButton>
        </template>
        <template v-else-if="isTokenFlow">
          <BaseButton v-if="tokenFinal" @click="downloadFinalReceipt">PDF Receipt</BaseButton>
          <BaseButton v-if="tokenFinal" @click="printFinalReceipt">Print Again</BaseButton>
          <BaseButton v-if="tokenFinal" variant="primary" @click="$emit('done')">Done</BaseButton>
          <BaseButton v-else-if="isCreditToken && tokenStep === 'confirm'" @click="tokenStep = 'form'">Back</BaseButton>
          <BaseButton v-if="!tokenFinal" variant="primary" :disabled="tokenLoading || Boolean(tokenActionError)" @click="handleTokenPrimary">{{ tokenPrimaryLabel }}</BaseButton>
        </template>
        <template v-else-if="isSopFlow">
          <BaseButton v-if="sopStep === 1" variant="primary" @click="sopNext">Continue &rarr;</BaseButton>
          <BaseButton v-else variant="primary" native-type="submit">Confirm</BaseButton>
        </template>
        <BaseButton v-else-if="action !== 'Print'" variant="primary" native-type="submit">Confirm</BaseButton>
      </div>
      </template>
    </BaseModalShell>
    <PickerModal
      v-if="activePickerField"
      :api="activePickerField.pickerApi"
      :columns="activePickerField.pickerColumns"
      :column-labels="activePickerField.pickerColumnLabels"
      :label="activePickerField.pickerTitle"
      @close="activePickerField = null"
      @select="onPickerSelect"
    />
  </div>
</template>

<script>
import PickerModal from "./PickerModal.vue";
import BaseButton from "./base/BaseButton.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { buildErrorReport, buildImportPreview, downloadTextFile, exportCsvText, exportExcelXml, parseImportFile, validateImportRows } from "../services/import-export.mjs";
import { logExportJob, logPrintJob } from "../services/local-jobs.mjs";
import { columnKey, printModelForRoute, tableSiteOptions } from "../services/table-service";
import { actionEndpoint, submitRouteAction } from "../services/action-service.mjs";
import { liveWritesAllowed, postApi } from "../services/api.js";
import { managementFields, managementFormSeed, ROLE_PERMISSIONS } from "../services/management-forms.mjs";
import { downloadReceiptPdf, openBrowserPrint, receiptHtml } from "../services/receipt-tools.mjs";
import { confirmationMessage, isWriteEndpoint, needsAuthorizationPassword } from "../services/write-helpers.mjs";
import { isFileUploadRoute, uploadAcceptValue, uploadSummary, validateUploadFile } from "../services/upload-policy.mjs";
import {
  buildTokenPayload,
  calculateTokenAmount,
  calculateTokenUnits,
  findTariff,
  isCreditTokenRoute,
  isTokenGenerateAction,
  parseTariffUnitPrice,
  paymentMethods,
  purchaseWays,
  tokenEndpoint,
  tokenResultFields,
  tokenValidationError
} from "../services/token-flow.mjs";
import {
  buildRemoteTaskPayload,
  defaultRemoteDataItem,
  isGprsSupportTaskRoute,
  isRemoteMeterReadingRoute,
  isRemoteTaskAction,
  normalizeRemoteDataItems,
  normalizeRemoteDataItem,
  readingDataItemGroups,
  remoteTaskNeedsAuthorization,
  remoteTaskEndpoint,
  remoteTaskKind,
  remoteTaskOptions,
  remoteTaskTitle,
  remoteTaskValidationError
} from "../services/remote-task-flow.mjs";
import { toastBus, toastSuccess, toastError, toastWarn } from "../services/toast.js";

export default {
  name: "ActionModal",
  components: { BaseButton, BaseCheckbox, BaseIconButton, BaseInput, BaseModalShell, BaseSelect, PickerModal },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  data() {
    const rowDataItem = normalizeRemoteDataItem(this.route, this.row.dataItem);
    const batchMeterIds = this.action === "Add Batch Task"
      ? this.rows.map((row) => String(row?.meterId || "")).filter(Boolean)
      : [];
    return {
      form: {
        ...this.row,
        ...managementFormSeed(this.route, this.action, this.row),
        authorizationPassword: "",
        confirmDelete: false,
        amount: this.row.amount || "",
        totalUnit: this.row.totalUnit || "",
        payDebtPercent: this.row.payDebtPercent || "0",
        purchaseWay: this.row.purchaseWay || "paid",
        paymentMethod: this.row.paymentMethod || "Cash",
        maximumPower: this.row.maximumPower || "",
        dataItem: rowDataItem || defaultRemoteDataItem(this.route),
        selectedMeterIds: batchMeterIds,
        selectedDataItems: [],
        token: this.row.token || this.row.data || "",
        confirmationText: confirmationMessage(this.action, this.route.title)
      },
      result: "",
      error: "",
      requestLog: "",
      responseLog: "",
      importRows: [],
      importErrors: [],
      selectedFile: null,
      uploadPreview: "",
      stations: [],
      tariffs: [],
      tokenPreview: null,
      tokenFinal: null,
      tokenStep: "form",
      remoteBatchStep: "form",
      tokenLoading: false,
      debtPercents: ["0", "10", "20", "30", "50", "100"],
      purchaseWays,
      paymentMethods,
      activePickerField: null,
      sopStep: 1,
      roles: [],
      rolesLoading: false,
      showPwField: false,
      permOpen: false,
      dataItemFilter: "",
      tokenSendLoading: false,
      tokenSentStatus: ""
    };
  },
  computed: {
    title() {
      if (this.isRemoteTaskFlow) return remoteTaskTitle(this.route, this.action);
      if (this.isCreditToken && this.tokenStep === "confirm") return "Transaction Confirmation";
      if (this.action === "Recharge") return "Recharge";
      if (this.action === "Generate Token") return `Generate Token (${this.route.title.replace(" Token", "")})`;
      return `${this.action} ${this.route.title}`;
    },
    modalHeading() {
      if (this.isSopFlow) return this.sopStepTitle;
      if (this.isRemoteTaskFlow || this.isTokenFlow) return this.title;
      if (this.isCreateAction) return "Create";
      if (this.action === "Edit") return "Update";
      return this.title;
    },
    isSopFlow() {
      const h = this.route?.hash || "";
      return (h.includes("admin/user") || h.includes("admin/role")) && (this.action === "Add" || this.action === "Edit");
    },
    sopStepTitle() {
      const base = this.action === "Add" ? `Create ${this.route.title}` : `Edit ${this.route.title}`;
      return this.sopStep === 1 ? base : "Review & Confirm";
    },
    actionBadgeClass() {
      if (this.action === "Delete") return "badge-danger";
      if (this.action === "Edit") return "badge-warning";
      return "badge-primary";
    },
    actionIcon() {
      if (this.action === "Delete") return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      if (this.action === "Edit")   return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
    },
    pwStrength() {
      const p = String(this.form.password || "");
      if (!p) return 0;
      let s = 0;
      if (p.length >= 8) s++;
      if (/[A-Z]/.test(p)) s++;
      if (/[0-9]/.test(p)) s++;
      if (/[^A-Za-z0-9]/.test(p)) s++;
      return s;
    },
    pwLabel() {
      return ["", "Weak", "Fair", "Good", "Strong"][this.pwStrength];
    },
    // --- Role permissions picker ---
    rolePermissions() {
      return ROLE_PERMISSIONS;
    },
    permissionsSelected() {
      const raw = String(this.form.remark || "");
      return raw ? raw.split(",").map(v => v.trim()).filter(Boolean) : [];
    },
    permSelectedCount() {
      return this.permissionsSelected.length;
    },
    simpleBody() {
      if (this.action === "Delete") return `Delete ${this.route.title} record`;
      if (this.action === "Export") return `Export ${this.rows.length || this.route.title.length} records`;
      if (this.action === "Print") return `Print ${this.route.title} receipt`;
      if (this.action === "Close") return `Close ${this.route.title} detail`;
      return "";
    },
    fields() {
      if (this.action === "Import") return this.makeFields(["File Name", "Remark"]);
      if (this.action === "Recharge") return this.makeFields(["Customer Id", "Meter Id", "Amount", "Total Unit"]);
      if (this.action === "Generate Token") return this.makeFields(["Customer Id", "Meter Id", "Remark"]);
      if (this.action === "Add Task" || this.action === "Add Batch Task") {
        if (isGprsSupportTaskRoute(this.route)) return this.makeFields(["Customer Id", "Customer Name", "Meter Id", "Protocol Version", "Data Item", "Station Id", "Remark"]);
        return this.makeFields(["Meter Id", "Data Item", "Station Id", "Remark"]);
      }
      const exactManagementFields = managementFields(this.route, this.action);
      if (exactManagementFields.length) return exactManagementFields;
      return this.route.columns.filter((column) => !["Actions", "Status", "status", "Success Rate", "successRate"].includes(column)).slice(0, 8).map((column) => ({ name: columnKey(column), label: column }));
    },
    writeAction() {
      return isWriteEndpoint(this.endpoint());
    },
    uploadMode() {
      return this.action === "Import" && isFileUploadRoute(this.route);
    },
    fileAccept() {
      return this.uploadMode ? uploadAcceptValue() : ".csv,.tsv,.txt,.xml,.xls";
    },
    showAuthorizationField() {
      return needsAuthorizationPassword(this.action, this.route);
    },
    importPreview() {
      if (this.uploadMode) return this.uploadPreview;
      if (this.action !== "Import" || !this.importRows.length) return "";
      const preview = buildImportPreview(this.rows, this.importRows);
      return `Preview: ${preview.imported} rows, ${preview.added} new, ${preview.unchanged} unchanged`;
    },
    receiptModel() {
      return printModelForRoute(this.route, this.row);
    },
    receiptPreviewSections() {
      const labels = {
        identity: "Receipt",
        customer: "Customer",
        meter: "Meter",
        transaction: "Transaction"
      };
      return Object.entries(labels)
        .map(([key, label]) => ({
          key,
          label,
          fields: this.receiptModel.fields.filter((field) => !field.isToken && (field.section || "transaction") === key)
        }))
        .filter((section) => section.fields.length);
    },
    isTokenFlow() {
      return isTokenGenerateAction(this.route, this.action);
    },
    isCreditToken() {
      return isCreditTokenRoute(this.route);
    },
    isMaximumPowerToken() {
      return String(this.route.hash || "").includes("set-maximum-power-limit");
    },
    isSimpleTokenRoute() {
      const hash = String(this.route.hash || "");
      return hash.includes("clear-tamper") || hash.includes("clear-credit") || hash.includes("set-maximum-power-limit");
    },
    selectedTariff() {
      return findTariff(this.tariffs, this.form.tariffId);
    },
    tokenUnitPrice() {
      return parseTariffUnitPrice(this.selectedTariff?.price);
    },
    tokenPriceText() {
      if (!this.form.tariffId) return "";
      if (!this.selectedTariff) return "Tariff data is missing";
      if (!this.tokenUnitPrice) return "Tariff price is invalid";
      return `Tariff price: ${this.tokenUnitPrice} MMK/kWh`;
    },
    tokenFormError() {
      return tokenValidationError(this.route, this.form, this.selectedTariff, { requireAuthorization: !this.isSimpleTokenRoute });
    },
    tokenPreviewError() {
      return tokenValidationError(this.route, this.form, this.selectedTariff, { requireAuthorization: !this.isCreditToken && !this.isSimpleTokenRoute });
    },
    tokenActionError() {
      if (this.isCreditToken && this.tokenStep === "form") return this.tokenPreviewError;
      if (!this.tokenPreview) return this.tokenPreviewError;
      return this.tokenFormError;
    },
    tokenPrimaryLabel() {
      if (this.tokenLoading) return "Processing...";
      if (this.isCreditToken && this.tokenStep === "form") return "Review";
      return "Generate Token";
    },
    tokenSteps() {
      return [
        { id: "form", number: 1, label: "Details" },
        { id: "confirm", number: 2, label: "Review" },
        { id: "final", number: 3, label: "Result" }
      ];
    },
    tokenStepState() {
      if (this.tokenFinal) return "final";
      return this.tokenStep === "confirm" ? "confirm" : "form";
    },
    formattedTokenAmount() {
      return Number(this.form.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    creditConfirmationFields() {
      return [
        ["Customer Id", this.form.customerId],
        ["Customer Name", this.form.customerName],
        ["Meter Id", this.form.meterId],
        ["Pay Debt(MMK)", this.form.payDebtPercent || "0"],
        ["Monthly Charge(MMK)", this.form.monthlyCharge || "0"],
        ["Total Unit(kWh)", this.form.totalUnit],
        ["Total Paid(MMK)", this.form.amount]
      ].filter((field) => field[1] !== undefined && field[1] !== null && field[1] !== "");
    },
    tokenPreviewFields() {
      return tokenResultFields(this.tokenPreview);
    },
    tokenFinalFields() {
      return tokenResultFields(this.tokenFinal);
    },
    tokenFinalSource() {
      return this.tokenFinal?.result || this.tokenFinal?.data || this.tokenFinal || {};
    },
    tokenFinalFailed() {
      const source = this.tokenFinalSource;
      const code = Number(source.code);
      return source.status === false || (Number.isFinite(code) && code !== 0 && code !== 200);
    },
    tokenFinalMessage() {
      const source = this.tokenFinalSource;
      return source.reason || source.msg || source.message || "Token request failed.";
    },
    finalTokenValue() {
      const source = this.tokenFinalSource;
      return source.token || source.tokenFirst || "";
    },
    finalReceiptModel() {
      return printModelForRoute(this.route, this.buildTokenReceiptRow(this.tokenFinal));
    },
    isRemoteTaskFlow() {
      return isRemoteTaskAction(this.route, this.action);
    },
    isRemoteBatchFlow() {
      return this.isRemoteTaskFlow && this.action === "Add Batch Task";
    },
    isRemoteBatchReadingFlow() {
      return this.isRemoteBatchFlow && isRemoteMeterReadingRoute(this.route);
    },
    isRemoteSupportTaskRoute() {
      return isGprsSupportTaskRoute(this.route);
    },
    isRemoteTokenTask() {
      return remoteTaskKind(this.route) === "token";
    },
    isCreateAction() {
      return this.action === "Add" || this.action === "Add Batch Task";
    },
    remoteDataOptions() {
      return remoteTaskOptions[remoteTaskKind(this.route)];
    },
    remoteBatchSteps() {
      return [
        { id: "form", number: 1, label: "Select" },
        { id: "review", number: 2, label: "Review" }
      ];
    },
    remoteBatchRows() {
      const rows = this.rows.filter((row) => row?.meterId);
      const selectedMeterIds = Array.isArray(this.form.selectedMeterIds) ? this.form.selectedMeterIds : [];
      if (!selectedMeterIds.length) return rows;
      return rows.filter((row) => selectedMeterIds.includes(String(row.meterId || "")));
    },
    remoteBatchCount() {
      return this.rows.filter((row) => row?.meterId).length;
    },
    remoteBatchMeterOptions() {
      return this.rows
        .filter((row) => row?.meterId)
        .map((row) => ({
          value: String(row.meterId || ""),
          label: [row.meterId, row.customerName || row.customerId || "", row.stationId || ""].filter(Boolean).join(" | ")
        }));
    },
    remoteBatchSelectedMeterCount() {
      return this.remoteBatchRows.length;
    },
    remoteBatchSelectedDataItems() {
      return normalizeRemoteDataItems(this.route, this.form.selectedDataItems);
    },
    remoteBatchPreviewRows() {
      return this.remoteBatchRows.slice(0, 6);
    },
    remoteBatchOverflowCount() {
      return Math.max(0, this.remoteBatchSelectedMeterCount - this.remoteBatchPreviewRows.length);
    },
    remoteBatchStationCount() {
      return new Set(this.remoteBatchRows.map((row) => String(row.stationId || "").trim()).filter(Boolean)).size;
    },
    remoteBatchSummaryText() {
      if (!this.remoteBatchSelectedMeterCount) return "Select meters";
      if (!this.remoteBatchSelectedDataItems.length) return "Select data items";
      return `${this.remoteBatchSelectedMeterCount} meter${this.remoteBatchSelectedMeterCount === 1 ? "" : "s"} x ${this.remoteBatchSelectedDataItems.length} item${this.remoteBatchSelectedDataItems.length === 1 ? "" : "s"}`;
    },
    remoteBatchSelectedDataItemsLabel() {
      if (!this.remoteBatchSelectedDataItems.length) return "No data items selected.";
      return `Data items: ${this.remoteBatchSelectedDataItems.join(", ")}`;
    },
    filteredDataItemGroups() {
      const filter = String(this.dataItemFilter || "").trim().toLowerCase();
      if (!filter) return readingDataItemGroups;
      return readingDataItemGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(filter) || group.group.toLowerCase().includes(filter)
          )
        }))
        .filter((group) => group.items.length > 0);
    },
    remoteTaskFormError() {
      return remoteTaskValidationError(this.route, this.form, { action: this.action, rows: this.rows });
    },
    remoteTaskAllowsManualEntry() {
      return this.isRemoteSupportTaskRoute;
    },
    remoteTaskRequiresAuthorization() {
      return remoteTaskNeedsAuthorization(this.route);
    }
  },
  watch: {
    "form.amount"() {
      this.syncTokenCalculation("amount");
    },
    "form.totalUnit"() {
      this.syncTokenCalculation("unit");
    },
    "form.purchaseWay"() {
      this.syncTokenCalculation("mode");
    },
    remoteDataOptions() {
      this.syncRemoteTaskDataItem();
    },
    tariffs() {
      this.syncTokenCalculation("tariff");
    }
  },
  async created() {
    this.syncRemoteTaskDataItem();
    if (this.fields.some(f => f.name === "stationId")) {
      try {
        const response = await postApi("/api/station/read", { pageNumber: 1, pageSize: 500 });
        const rows = response?.result?.data || response?.data?.data || response?.data || [];
        if (Array.isArray(rows)) {
          this.stations = rows.map(s => ({
            value: String(s.stationId || s.id || s.name || "").toUpperCase(),
            label: s.name || s.stationId || s.id || ""
          }));
        }
        // Ensure the current row's stationId is always in the list
        const currentValue = String(this.form.stationId || "").toUpperCase();
        if (currentValue && !this.stations.some(s => s.value === currentValue)) {
          this.stations.push({ value: currentValue, label: currentValue });
        }
      } catch (error) {
        console.error("ActionModal: Failed to fetch stations", error);
      }
    }
    if (this.isTokenFlow) this.loadTariffs();
    if (this.fields.some(f => f.type === "role-select")) this.loadRoles();
  },
  methods: {
    syncRemoteTaskDataItem() {
      if (!this.isRemoteTaskFlow) return;
      if (this.isRemoteBatchFlow) {
        // For batch reading flow: auto-select all data items from grouped structure
        if (this.isRemoteBatchReadingFlow && (!this.form.selectedDataItems || !this.form.selectedDataItems.length)) {
          const allItems = readingDataItemGroups.flatMap((g) => g.items.map((i) => i.value));
          this.form.selectedDataItems = allItems;
        } else {
          const normalizedItems = normalizeRemoteDataItems(this.route, this.form.selectedDataItems);
          if (JSON.stringify(normalizedItems) !== JSON.stringify(this.form.selectedDataItems || [])) {
            this.form.selectedDataItems = normalizedItems;
          }
        }
        if (Array.isArray(this.form.selectedMeterIds)) {
          const validMeterIds = new Set(this.rows.filter((row) => row?.meterId).map((row) => String(row.meterId || "")));
          const normalizedMeterIds = this.form.selectedMeterIds.map((value) => String(value || "")).filter((value) => validMeterIds.has(value));
          if (JSON.stringify(normalizedMeterIds) !== JSON.stringify(this.form.selectedMeterIds)) {
            this.form.selectedMeterIds = normalizedMeterIds;
          }
        }
        return;
      }
      const normalized = normalizeRemoteDataItem(this.route, this.form.dataItem);
      if (normalized) {
        if (this.form.dataItem !== normalized) this.form.dataItem = normalized;
        return;
      }
      const fallback = defaultRemoteDataItem(this.route);
      if (fallback && this.form.dataItem !== fallback) this.form.dataItem = fallback;
    },
    makeFields(labels) {
      return labels.map((label) => ({ name: columnKey(label), label }));
    },
    async loadRoles() {
      this.rolesLoading = true;
      try {
        const response = await postApi("/api/role/read", { pageNumber: 1, pageSize: 200 });
        const rows = response?.result?.data || response?.data?.data || response?.data || [];
        if (Array.isArray(rows)) {
          this.roles = rows.map(r => ({
            value: String(r.roleId || r.id || ""),
            label: r.name ? `${r.roleId || r.id} — ${r.name}` : String(r.roleId || r.id || "")
          })).filter(r => r.value);
        }
      } catch (e) {
        console.error("ActionModal: Failed to fetch roles", e);
      } finally {
        this.rolesLoading = false;
      }
    },
    sopNext() {
      // Basic validation before moving to review step
      const required = this.fields.filter(f => f.required);
      for (const f of required) {
        if (!String(this.form[f.name] || "").trim()) {
          this.error = `${f.label} is required`;
          return;
        }
      }
      this.error = "";
      this.sopStep = 2;
    },
    fieldOptions(field) {
      if (field.name === "stationId") {
        const staticSites = tableSiteOptions.filter(opt => opt.value !== "");
        const combined = [...staticSites];
        for (const station of this.stations) {
          if (!combined.some(s => s.value === station.value)) {
            combined.push(station);
          }
        }
        return combined;
      }
      if (Array.isArray(field.options) && field.options.length) {
        return field.options;
      }
      return [];
    },
    // --- Permission picker helpers (writes back to form.remark as CSV) ---
    togglePerm(value) {
      const current = [...this.permissionsSelected];
      const idx = current.indexOf(value);
      if (idx === -1) current.push(value);
      else current.splice(idx, 1);
      this.form.remark = current.join(",");
    },
    isPermSelected(value) {
      return this.permissionsSelected.includes(value);
    },
    clearPerms() {
      this.form.remark = "";
    },
    selectAllPerms() {
      const all = ROLE_PERMISSIONS.flatMap(g => g.items.map(i => i.value));
      this.form.remark = all.join(",");
    },
    advanceRemoteBatchStep() {
      this.error = "";
      const validationError = this.remoteTaskFormError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      this.remoteBatchStep = "review";
    },
    // --- Grouped data-item checkbox helpers ---
    isDataItemSelected(value) {
      return Array.isArray(this.form.selectedDataItems) && this.form.selectedDataItems.includes(value);
    },
    isDataItemGroupChecked(group) {
      return group.items.every((item) => this.isDataItemSelected(item.value));
    },
    isDataItemGroupPartial(group) {
      const selected = group.items.filter((item) => this.isDataItemSelected(item.value));
      return selected.length > 0 && selected.length < group.items.length;
    },
    toggleDataItem(value) {
      const current = Array.isArray(this.form.selectedDataItems) ? [...this.form.selectedDataItems] : [];
      const idx = current.indexOf(value);
      if (idx === -1) current.push(value);
      else current.splice(idx, 1);
      this.form.selectedDataItems = current;
    },
    toggleDataItemGroup(group) {
      const allChecked = this.isDataItemGroupChecked(group);
      const current = Array.isArray(this.form.selectedDataItems) ? [...this.form.selectedDataItems] : [];
      for (const item of group.items) {
        const idx = current.indexOf(item.value);
        if (allChecked) {
          if (idx !== -1) current.splice(idx, 1);
        } else {
          if (idx === -1) current.push(item.value);
        }
      }
      this.form.selectedDataItems = current;
    },
    handlePicker(field) {
      this.activePickerField = field;
    },
    onPickerSelect(row) {
      if (!this.activePickerField) return;
      const field = this.activePickerField;
      // Use pickerValueKey if specified, otherwise use the first pickerColumn, then fallback to 'id'
      const valueKey = field.pickerValueKey || field.pickerColumns?.[0] || "id";
      // Find the value using case-insensitive key matching
      let value = row[valueKey];
      if (value === undefined) {
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === valueKey.toLowerCase());
        value = actualKey ? row[actualKey] : undefined;
      }
      // Last resort: try the field name itself
      if (value === undefined) {
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === field.name.toLowerCase());
        value = actualKey ? row[actualKey] : row.id;
      }
      this.form[field.name] = value ?? "";
      
      // Store stationId for cross-validation on the account form
      const rowStationId = row.stationId || row.siteId || row.StationId || "";
      if (field.name === "customerId") {
        this.form.customerStationId = rowStationId;
        if (!this.form.stationId && rowStationId) this.form.stationId = String(rowStationId).toUpperCase();
      } else if (field.name === "meterId") {
        this.form.meterStationId = rowStationId;
        if (rowStationId) this.form.stationId = String(rowStationId).toUpperCase();
        if (row.protocolVersion && !this.form.protocolVersion) this.form.protocolVersion = row.protocolVersion;
      }
      
      this.activePickerField = null;
    },
    formatMoney(value) {
      return Number(value || 0).toLocaleString(undefined, {
        maximumFractionDigits: 2
      });
    },
    async handleImportFile(event) {
      this.error = "";
      const file = event.target.files?.[0];
      if (!file) return;
      this.form.fileName = file.name;
      this.selectedFile = file;
      if (this.uploadMode) {
        const validationError = validateUploadFile(file);
        if (validationError) {
          this.error = validationError;
          this.uploadPreview = "";
          return;
        }
        this.uploadPreview = uploadSummary(file);
        return;
      }
      const importedRows = await parseImportFile(file);
      const validated = validateImportRows(this.route, importedRows, columnKey);
      this.importRows = validated.rows;
      this.importErrors = validated.errors;
      if (this.importErrors.length) {
        const report = buildErrorReport(this.importErrors);
        downloadTextFile(`${this.route.title}-import-errors.csv`, report, "text/csv;charset=utf-8");
        this.error = `Import has ${this.importErrors.length} validation errors`;
      }
    },
    async printReceipt() {
      const opened = openBrowserPrint(this.receiptModel);
      await logPrintJob(this.route, this.receiptModel, "browser", "credit", {
        fileName: `${this.route.title.replace(/\s+/g, "_")}_receipt.html`,
        content: receiptHtml(this.receiptModel),
        contentType: "text/html;charset=utf-8",
        format: "html"
      });
      this.result = opened ? "Browser print opened" : "Browser blocked the print window";
    },
    async downloadPdf() {
      const result = await downloadReceiptPdf(this.receiptModel);
      await logPrintJob(this.route, this.receiptModel, "pdf", "credit", {
        fileName: `${this.route.title.replace(/\s+/g, "_")}_receipt.html`,
        content: receiptHtml(this.receiptModel),
        contentType: "text/html;charset=utf-8",
        format: "html"
      });
      this.result = result?.mode === "fallback" ? "PDF fallback exported" : "PDF export ready";
    },
    endpoint() {
      return actionEndpoint(this.route, this.action, this.uploadMode);
    },
    normalizeRows(response) {
      const data = response?.data;
      const result = response?.result;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.list)) return data.list;
      if (Array.isArray(result)) return result;
      if (Array.isArray(result?.data)) return result.data;
      if (Array.isArray(result?.list)) return result.list;
      if (Array.isArray(response?.rows)) return response.rows;
      return [];
    },
    async loadTariffs() {
      if (!this.isCreditToken && !this.isMaximumPowerToken) return;
      try {
        const response = await postApi("/api/tariff/read", {});
        this.tariffs = this.normalizeRows(response);
      } catch (error) {
        this.error = error?.message || "Tariff data failed";
      }
    },
    syncTokenCalculation(source) {
      if (!this.isCreditToken) return;
      this.tokenPreview = null;
      this.tokenFinal = null;
      this.tokenStep = "form";
      const tariff = this.selectedTariff;
      if (!tariff) return;
      if (this.form.purchaseWay === "unit") {
        if (source === "amount") return;
        const amount = calculateTokenAmount(this.form.totalUnit, tariff);
        if (amount !== "" && String(this.form.amount) !== amount) this.form.amount = amount;
        return;
      }
      if (source === "unit") return;
      const totalUnit = calculateTokenUnits(this.form.amount, tariff);
      if (totalUnit !== "" && String(this.form.totalUnit) !== totalUnit) this.form.totalUnit = totalUnit;
    },
    async handleTokenPrimary() {
      if (this.isCreditToken && this.tokenStep === "form") {
        await this.previewToken();
        return;
      }
      if (!this.tokenPreview) {
        await this.previewToken();
        return;
      }
      await this.confirmToken();
    },
    async previewToken() {
      this.error = "";
      this.result = "";
      this.tokenFinal = null;
      const validationError = this.tokenPreviewError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      this.tokenLoading = true;
      try {
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: true });
        this.requestLog = "";
        const response = await postApi(endpoint, payload);
        this.responseLog = "";
        this.tokenPreview = response;
        if (this.isCreditToken) this.tokenStep = "confirm";
      } catch (error) {
        this.error = error?.message || "Preview failed";
      } finally {
        this.tokenLoading = false;
      }
    },
    async confirmToken() {
      this.error = "";
      if (!this.tokenPreview) {
        this.error = "Preview is required";
        return;
      }
      const validationError = this.tokenFormError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      if (!liveWritesAllowed()) {
        this.error = "Writes are blocked until VITE_ALLOW_LIVE_WRITES=true";
        return;
      }
      this.tokenLoading = true;
      const receiptPopup = typeof window !== "undefined" ? window.open("", "_blank", "width=900,height=700") : null;
      try {
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: false });
        this.requestLog = "";
        const response = await postApi(endpoint, payload);
        this.responseLog = "";
        this.tokenFinal = response;
        if (this.tokenFinalFailed) {
          if (receiptPopup && !receiptPopup.closed) receiptPopup.close();
          this.result = "";
          toastError(this.tokenFinalMessage);
          return;
        }
        const receiptRow = this.buildTokenReceiptRow(response);
        const receiptModel = printModelForRoute(this.route, receiptRow);
        openBrowserPrint(receiptModel, receiptPopup);
        await logPrintJob(this.route, receiptModel, "auto-token", "credit", {
          fileName: `${this.route.title.replace(/\s+/g, "_")}_token_receipt.html`,
          content: receiptHtml(receiptModel),
          contentType: "text/html;charset=utf-8",
          format: "html"
        });
        this.result = "Token generated. Receipt opened";
        toastSuccess("Token generated. Receipt opened.");
      } catch (error) {
        if (receiptPopup && !receiptPopup.closed) receiptPopup.close();
        this.error = error?.message || "Token failed";
        toastError(error?.message || "Token failed");
      } finally {
        this.tokenLoading = false;
      }
    },
    async sendTokenToMeter() {
      if (!this.finalTokenValue) return;
      this.tokenSendLoading = true;
      this.tokenSentStatus = "";
      try {
        const payload = [{
          customerId: this.form.customerId || this.row.customerId || "",
          customerName: this.form.customerName || this.row.customerName || "",
          meterId: this.form.meterId || this.row.meterId || "",
          version: this.form.protocolVersion || this.row.protocolVersion || "2.2",
          flag: "A120",
          name: "Send Token",
          dataItem: "Send Token",
          dataDefault: "",
          dataPrefix: "",
          data: String(this.finalTokenValue).replace(/\s+/g, ""),
          stationId: this.form.stationId || this.row.stationId || "",
          remark: "Auto-sent after generation"
        }];
        const response = await postApi("/API/RemoteMeterTask/CreateTokenTask", payload);
        toastSuccess("Token dispatched to meter successfully.");
        this.tokenSentStatus = "success";
      } catch (error) {
        toastError(error?.message || "Failed to send token to meter.");
        this.tokenSentStatus = "error";
      } finally {
        this.tokenSendLoading = false;
      }
    },
    buildTokenReceiptRow(response) {
      const data = response?.data || response?.result || {};
      return {
        ...this.row,
        ...this.form,
        ...data,
        receiptId: data.receiptId || this.form.receiptId || this.row.receiptId || "",
        customerId: this.form.customerId || this.row.customerId || "",
        customerName: this.form.customerName || this.row.customerName || "",
        meterId: this.form.meterId || this.row.meterId || "",
        stationId: this.form.stationId || this.row.stationId || "",
        totalPaid: this.form.amount || data.totalPaid || this.row.totalPaid || "",
        totalUnit: this.form.totalUnit || data.totalUnit || this.row.totalUnit || "",
        token: data.token || this.form.token || this.row.token || "",
        time: data.createTime || data.time || new Date().toISOString().replace("T", " ").slice(0, 19)
      };
    },
    tokenStepDone(stepId) {
      const order = { form: 1, confirm: 2, final: 3 };
      return order[stepId] < order[this.tokenStepState];
    },
    remoteBatchStepDone(stepId) {
      const order = { form: 1, review: 2 };
      return order[stepId] < order[this.remoteBatchStep];
    },
    async printFinalReceipt() {
      const opened = openBrowserPrint(this.finalReceiptModel);
      await logPrintJob(this.route, this.finalReceiptModel, "browser-repeat", "credit", {
        fileName: `${this.route.title.replace(/\s+/g, "_")}_final_receipt.html`,
        content: receiptHtml(this.finalReceiptModel),
        contentType: "text/html;charset=utf-8",
        format: "html"
      });
      this.result = opened ? "Browser print opened" : "Browser blocked the print window";
    },
    async downloadFinalReceipt() {
      const result = await downloadReceiptPdf(this.finalReceiptModel);
      await logPrintJob(this.route, this.finalReceiptModel, "pdf-final", "credit", {
        fileName: `${this.route.title.replace(/\s+/g, "_")}_final_receipt.html`,
        content: receiptHtml(this.finalReceiptModel),
        contentType: "text/html;charset=utf-8",
        format: "html"
      });
      this.result = result?.mode === "fallback" ? "PDF fallback exported" : "PDF export ready";
    },
    async confirmRemoteTask() {
      this.error = "";
      this.result = "";
      const validationError = this.remoteTaskFormError;
      if (validationError) {
        this.error = validationError;
        return;
      }
      if (!liveWritesAllowed()) {
        this.error = "Writes are blocked until VITE_ALLOW_LIVE_WRITES=true";
        return;
      }
      this.tokenLoading = true;
      try {
        const endpoint = remoteTaskEndpoint(this.route);
        const payloads = buildRemoteTaskPayload(this.route, this.action, this.form, this.rows);

        // Upstream API contract:
        //  1. Payload MUST be a JSON array: List<DLT645TaskRequest>
        //  2. All items in one call must share the same data item/flag
        //     ("You can only select one item for reading each time")
        // Strategy: group payloads by dataItem, send one array call per group
        const groups = new Map();
        for (const p of payloads) {
          const key = p.dataItem || p.flag || "_default";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(p);
        }

        const groupEntries = Array.from(groups.entries());
        this.requestLog = JSON.stringify({
          endpoint,
          totalTasks: payloads.length,
          groups: groupEntries.map(([key, items]) => ({ dataItem: key, count: items.length }))
        }, null, 2);

        // Fire one API call per data-item group, concurrently
        const results = await Promise.allSettled(
          groupEntries.map(([, items]) => postApi(endpoint, items))
        );

        const succeeded = [];
        const failed = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const [key] = groupEntries[i];
          if (r.status === "rejected") {
            failed.push({ dataItem: key, error: r.reason?.message || String(r.reason) });
          } else {
            const code = Number(r.value?.code);
            if (Number.isFinite(code) && code !== 0 && code !== 200) {
              failed.push({ dataItem: key, error: r.value?.reason || r.value?.msg || `code ${code}` });
            } else {
              const items = Array.isArray(r.value?.result) ? r.value.result : (Array.isArray(r.value?.data) ? r.value.data : []);
              succeeded.push({ dataItem: key, count: items.length || groupEntries[i][1].length });
            }
          }
        }

        this.responseLog = JSON.stringify(
          results.map(r => r.status === "fulfilled" ? r.value : { error: r.reason?.message }),
          null, 2
        );

        const totalSubmitted = succeeded.reduce((sum, g) => sum + g.count, 0);

        if (failed.length === groupEntries.length) {
          throw new Error(failed.map(f => `${f.dataItem}: ${f.error}`).join("; "));
        }
        if (failed.length > 0) {
          this.result = `${totalSubmitted} task${totalSubmitted > 1 ? "s" : ""} submitted, ${failed.length} group${failed.length > 1 ? "s" : ""} failed`;
          toastWarn(`Partial: ${totalSubmitted} submitted, ${failed.length} failed`);
          this.$emit("done", { endpoint, payloads, succeeded, failed });
          return;
        }

        this.result = `${totalSubmitted} task${totalSubmitted > 1 ? "s" : ""} submitted`;
        toastSuccess(`${totalSubmitted} task${totalSubmitted > 1 ? "s" : ""} submitted successfully`);
        this.$emit("done", { endpoint, payloads, succeeded, failed: [] });
      } catch (error) {
        this.error = error?.message || "Task failed";
        toastError(error?.message || "Task failed");
      } finally {
        this.tokenLoading = false;
      }
    },
    async submit() {
      this.error = "";
      if (this.isRemoteTaskFlow) {
        if (this.isRemoteBatchFlow && this.remoteBatchStep === "form") {
          this.advanceRemoteBatchStep();
          return;
        }
        await this.confirmRemoteTask();
        return;
      }
      if (this.isTokenFlow) {
        await this.previewToken();
        return;
      }
      if (this.action === "Import" && this.importErrors.length) return;
      if (this.action === "Export") {
        const timestamp = new Date().toISOString().split("T")[0];
        const baseFilename = `Beverly_${this.route.title.replace(/\s+/g, "_")}_${timestamp}`;
        const csvText = exportCsvText(this.route, this.rows, columnKey);
        const excelXml = exportExcelXml(this.route, this.rows, columnKey);
        downloadTextFile(`${baseFilename}.csv`, csvText, "text/csv;charset=utf-8");
        downloadTextFile(`${baseFilename}.xls`, excelXml, "application/vnd.ms-excel");
        await logExportJob(this.route, this.rows, "csv", {
          fileName: `${baseFilename}.csv`,
          content: csvText,
          contentType: "text/csv;charset=utf-8"
        });
        await logExportJob(this.route, this.rows, "xls", {
          fileName: `${baseFilename}.xls`,
          content: excelXml,
          contentType: "application/vnd.ms-excel"
        });
        this.result = `Export ready: ${this.rows.length} rows`;
        toastSuccess(`Export ready — ${this.rows.length} rows downloaded`);
        return;
      }

      try {
        if (this.route.hash.includes("management/account") && (this.action === "Add" || this.action === "Edit")) {
          const customerStation = this.form.customerStationId || "";
          const meterStation = this.form.meterStationId || "";
          if (customerStation && meterStation && customerStation !== meterStation) {
            const msg = `Mismatch: Customer is in ${customerStation}, Meter is in ${meterStation}`;
            this.error = msg;
            toastError(msg);
            return;
          }
        }

        const actionResult = await submitRouteAction(this.route, this.action, this.form, {
          fields: this.fields,
          importRows: this.importRows,
          selectedFile: this.selectedFile,
          uploadMode: this.uploadMode
        });
        this.requestLog = JSON.stringify(actionResult.requestLog, null, 2);
        this.responseLog = JSON.stringify(actionResult.responseLog, null, 2);
        console.info("[write-request]", this.requestLog);
        console.info("[write-response]", this.responseLog);
        if (this.action === "Print") {
          this.result = this.receiptModel.fields.length ? this.receiptModel.fields.map((field) => `${field.label}: ${field.value}`).join(" | ") : "Print success";
        } else if (this.uploadMode) {
          this.result = `Upload submitted: ${this.form.fileName}`;
          toastSuccess(`Upload submitted: ${this.form.fileName}`);
        } else if (this.action === "Import") {
          this.result = `Import submitted: ${this.importRows.length} rows`;
          toastSuccess(`Import submitted — ${this.importRows.length} rows`);
        } else {
          this.result = actionResult.resultText;
          toastSuccess(actionResult.resultText || `${this.action} completed successfully.`);
        }
        this.$emit("done", actionResult);
      } catch (error) {
        const msg = error?.response?.data?.msg || error?.response?.data?.reason || error?.response?.data?.error || error?.message || "Action failed";
        this.error = msg;
        toastError(msg);
      }
    }
  }
};
</script>
