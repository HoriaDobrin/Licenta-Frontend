import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { BasketService } from 'src/app/basket/basket.service';
import { CheckoutService } from '../checkout.service';
import { ToastrService } from 'ngx-toastr';
import { Basket } from 'src/app/shared/Models/Basket';
import { Address } from 'src/app/shared/Models/User';
import { NavigationExtras, Router } from '@angular/router';
import { Stripe, StripeCardCvcElement, StripeCardExpiryElement, StripeCardNumberElement, loadStripe } from '@stripe/stripe-js';
import { firstValueFrom } from 'rxjs';
import { OrderToCreate } from 'src/app/shared/Models/Order';

@Component({
  selector: 'app-checkout-payment',
  templateUrl: './checkout-payment.component.html',
  styleUrls: ['./checkout-payment.component.scss']
})
export class CheckoutPaymentComponent implements OnInit {
  @Input() checkoutForm?: FormGroup;
  @ViewChild('cardNumber') cardNumberElem?: ElementRef;
  @ViewChild('cardExpiry') cardExpiryElem?: ElementRef;
  @ViewChild('cardCvc') cardCvcElem?: ElementRef;

  stripe: Stripe | null = null;
  cardNumber?: StripeCardNumberElement;
  cardExpiry?: StripeCardExpiryElement;
  cardCvc?: StripeCardCvcElement;

  cardNumberComplete = false;
  cardExpiryComplete = false;
  cardCvcComplete = false;

  cardErrors: any;

  loading = false;


  constructor(private basketService: BasketService, private checkoutService: CheckoutService,
    private toastr: ToastrService, private router: Router) { }


  ngOnInit(): void {
    loadStripe('pk_test_51NJty6KrHYqrluTHpDLvU4RZWam2efHjnYrUFihuDo4vhTIyLBoUYdbKNDLQc7rxfHuE709CNXCnnSFAV3WDsSnk00TYW9ErjK').then(stripe => {
      this.stripe = stripe;
      const elements = stripe?.elements();
      if (elements) {
        this.cardNumber = elements.create('cardNumber');
        this.cardNumber.mount(this.cardNumberElem?.nativeElement);
        this.cardNumber.on('change', event => {
          this.cardNumberComplete = event.complete;
          if (event.error) this.cardErrors = event.error.message;
          else this.cardErrors = null;
        })

        this.cardExpiry = elements.create('cardExpiry');
        this.cardExpiry.mount(this.cardExpiryElem?.nativeElement);
        this.cardExpiry.on('change', event => {
          this.cardExpiryComplete = event.complete;
          if (event.error) this.cardErrors = event.error.message;
          else this.cardErrors = null;
        })

        this.cardCvc = elements.create('cardCvc');
        this.cardCvc.mount(this.cardCvcElem?.nativeElement);
        this.cardCvc.on('change', event => {
          this.cardCvcComplete = event.complete;
          if (event.error) this.cardErrors = event.error.message;
          else this.cardErrors = null;
        })
      }
    })
  }

  getPaymentFormComplete(){
    return this.checkoutForm?.get('paymentForm')?.valid 
    && this.cardCvcComplete 
    && this.cardExpiryComplete 
    && this.cardNumberComplete;
  }

  async submitOrder() {
    this.loading = true;

    const basket = this.basketService.getCurrentBasketValue();
    try {
      const createdOrder = await this.createOrder(basket);
      const paymentResult = await this.confirmPaymentWithStripe(basket);

      if(!basket) throw new Error('Cannot get basket');

      if (paymentResult.paymentIntent) {
        this.basketService.deleteBasket(basket);
        const navigationExtras: NavigationExtras = { state: createdOrder };
        this.router.navigate(['checkout/success'], navigationExtras);
      } else {
        this.toastr.error(paymentResult.error.message);
      }
    } catch (error : any) {
        console.log(error);
        this.toastr.error(error.message);
        
    } finally {
      this.loading = false;
    }

  }

  private async confirmPaymentWithStripe(basket: Basket | null) {
    if(!basket) throw new Error('Basket is null');

    const result = this.stripe?.confirmCardPayment(basket.clientSecret!, {
      payment_method: {
        card: this.cardNumber!,
        billing_details: {
          name: this.checkoutForm?.get('paymentForm')?.get('nameOnCard')?.value
        }
      }
    });

    if(!result) throw new Error('Problem attending with stripe');

    return result;
  }

  private async createOrder(basket: Basket | null) {
    if(!basket) throw new Error('Basket is null');
    const orderToCreate = this.getOrderToCreate(basket);

    return firstValueFrom(this.checkoutService.createOrder(orderToCreate));
  }

  private getOrderToCreate(basket: Basket) : OrderToCreate {
    const deliveryMethod_Id = this.checkoutForm?.get('deliveryForm')?.get('deliveryMethod')?.value;
    const _shipToAddress = this.checkoutForm?.get('addressForm')?.value as Address;

    if (!deliveryMethod_Id || !_shipToAddress) throw new Error('Problem with basket');

    return {
      basketId: basket.id,
      deliveryMethodId: deliveryMethod_Id,
      shipToAddress: _shipToAddress
    }
  }
}
