import type { DefineComponent } from 'vue';

type DataView = 'grid' | 'list' | 'table';

declare const WalletDataViewSwitch: DefineComponent<{
  modelValue: DataView;
  modes?: DataView[];
  label?: string;
}>;

export default WalletDataViewSwitch;
